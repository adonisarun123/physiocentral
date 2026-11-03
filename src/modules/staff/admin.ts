import { randomInt } from "node:crypto";
import { tx, q, q1, type Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit } from "@/modules/audit";
import { assertPermission, type Actor, type StaffActor } from "@/modules/auth/actor";
import { ROLES, type Role } from "@/modules/auth/permissions";

/**
 * Staff logins (public sign-up stays disabled). The owner creates a login and
 * receives a one-time temporary password to hand over in person; the person
 * changes it and turns on two-step verification at first sign-in.
 * Guards: only an owner can grant or remove OWNER, the last active owner can
 * never be removed or deactivated, and nobody can lock themselves out.
 */

export const ROLE_LABELS: Record<Role, { label: string; help: string }> = {
  OWNER: { label: "Owner", help: "Everything, including staff logins and verifying payments" },
  CLINIC_ADMIN: { label: "Clinic admin", help: "Bookings, patients, catalog, hours & leave, draft invoices, record payments" },
  RECEPTIONIST: { label: "Reception", help: "Bookings, patients, draft invoices, record (not verify) payments" },
  PHYSIOTHERAPIST: { label: "Physiotherapist", help: "Their visits: check-in, start, complete, estimates" },
  BILLING: { label: "Billing", help: "Issue invoices, verify and apply payments" },
  ACCOUNTANT: { label: "Accountant", help: "Read finances, tax set-up, prices, audit log" },
  CONTENT_EDITOR: { label: "Website editor", help: "Service descriptions only" },
};

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function tempPassword() {
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")).join("-");
}

function cleanRoles(roles: string[]): Role[] {
  const out = [...new Set(roles)].filter((r): r is Role => (ROLES as readonly string[]).includes(r));
  if (!out.length) throw new DomainError("VALIDATION", "Choose at least one role.");
  return out;
}

function guardOwnerGrant(actor: StaffActor, before: string[], after: string[]) {
  if ((before.includes("OWNER") !== after.includes("OWNER")) && !actor.roles.includes("OWNER")) {
    throw new DomainError("FORBIDDEN", "Only an owner can grant or remove the Owner role.");
  }
}

async function activeOwnersExcluding(db: Db, orgId: string, staffId: string) {
  return (await q1<{ n: number }>(
    `SELECT count(DISTINCT s.id)::int n FROM staff_member s JOIN role_grant g ON g.staff_member_id=s.id
      WHERE s.organization_id=$1 AND s.active AND g.role='OWNER' AND s.id <> $2`, [orgId, staffId], db))!.n;
}

async function authCtx() {
  const { auth } = await import("@/modules/auth/auth");
  return auth.$context;
}

export async function createStaffLogin(
  actor: Actor,
  input: { name: string; email: string; roles: string[]; therapistId?: string | null },
  correlationId: string,
) {
  assertPermission(actor, "USERS_MANAGE");
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) throw new DomainError("VALIDATION", "Enter their name.", { name: "Required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError("VALIDATION", "Enter a valid email address.", { email: "Invalid" });
  const roles = cleanRoles(input.roles);
  guardOwnerGrant(actor, [], roles);

  const ctx = await authCtx();
  if (await ctx.internalAdapter.findUserByEmail(email)) {
    throw new DomainError("DUPLICATE", "A login with this email already exists.");
  }
  const password = tempPassword();
  const user = await ctx.internalAdapter.createUser({ email, name, emailVerified: true }, { method: "admin" } as never);
  await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(password) });
  try {
    return await tx(async (db) => {
      const s = (await q1<{ id: string }>(
        `INSERT INTO staff_member (organization_id, auth_user_id, display_name) VALUES ($1,$2,$3) RETURNING id`,
        [actor.organizationId, user.id, name], db))!;
      for (const r of roles) await q(`INSERT INTO role_grant (organization_id, staff_member_id, role, granted_by) VALUES ($1,$2,$3,$4)`, [actor.organizationId, s.id, r, actor.label], db);
      if (input.therapistId) await linkTherapist(db, actor, s.id, input.therapistId);
      await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "staff.create", targetType: "staff_member", targetId: s.id, changes: { email, roles }, correlationId });
      return { staffId: s.id, email, tempPassword: password };
    });
  } catch (e) {
    await ctx.internalAdapter.deleteUser(user.id).catch(() => undefined); // don't leave an orphan login
    throw e;
  }
}

async function linkTherapist(db: Db, actor: StaffActor, staffId: string, therapistId: string | null) {
  await q(`UPDATE therapist SET staff_member_id=NULL WHERE staff_member_id=$1 AND organization_id=$2`, [staffId, actor.organizationId], db);
  if (!therapistId) return;
  const t = await q1<{ id: string }>(`UPDATE therapist SET staff_member_id=$1 WHERE id=$2 AND organization_id=$3 RETURNING id`, [staffId, therapistId, actor.organizationId], db);
  if (!t) throw new DomainError("NOT_FOUND", "Physiotherapist profile not found.");
}

async function lockStaff(db: Db, actor: StaffActor, staffId: string) {
  const s = await q1<{ id: string; auth_user_id: string; active: boolean; roles: string[] | null }>(
    `SELECT s.id, s.auth_user_id, s.active, (SELECT array_agg(role) FROM role_grant g WHERE g.staff_member_id=s.id) roles
       FROM staff_member s WHERE s.id=$1 AND s.organization_id=$2 FOR UPDATE`, [staffId, actor.organizationId], db);
  if (!s) throw new DomainError("NOT_FOUND", "Staff member not found.");
  return { ...s, roles: s.roles ?? [] };
}

export async function updateStaff(
  actor: Actor,
  input: { staffId: string; name: string; roles: string[]; therapistId?: string | null },
  correlationId: string,
) {
  assertPermission(actor, "USERS_MANAGE");
  const roles = cleanRoles(input.roles);
  return tx(async (db) => {
    const s = await lockStaff(db, actor, input.staffId);
    guardOwnerGrant(actor, s.roles, roles);
    if (s.id === actor.staffId && !roles.some((r) => r === "OWNER")) {
      if (actor.roles.includes("OWNER")) throw new DomainError("VALIDATION", "You can't remove your own Owner role. Ask another owner.");
    }
    if (s.roles.includes("OWNER") && !roles.includes("OWNER") && (await activeOwnersExcluding(db, actor.organizationId, s.id)) === 0) {
      throw new DomainError("VALIDATION", "This is the only owner. Make someone else an owner first.");
    }
    if (input.name.trim().length < 2) throw new DomainError("VALIDATION", "Enter a name.");
    await q(`UPDATE staff_member SET display_name=$2, updated_at=now() WHERE id=$1`, [s.id, input.name.trim()], db);
    await q(`DELETE FROM role_grant WHERE staff_member_id=$1`, [s.id], db);
    for (const r of roles) await q(`INSERT INTO role_grant (organization_id, staff_member_id, role, granted_by) VALUES ($1,$2,$3,$4)`, [actor.organizationId, s.id, r, actor.label], db);
    if (input.therapistId !== undefined) await linkTherapist(db, actor, s.id, input.therapistId);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "staff.update", targetType: "staff_member", targetId: s.id, changes: { roles: [s.roles, roles] }, correlationId });
  });
}

export async function setStaffActive(actor: Actor, input: { staffId: string; active: boolean }, correlationId: string) {
  assertPermission(actor, "USERS_MANAGE");
  const res = await tx(async (db) => {
    const s = await lockStaff(db, actor, input.staffId);
    if (s.id === actor.staffId) throw new DomainError("VALIDATION", "You can't deactivate your own login.");
    if (!input.active && s.roles.includes("OWNER")) {
      if (!actor.roles.includes("OWNER")) throw new DomainError("FORBIDDEN", "Only an owner can deactivate an owner.");
      if ((await activeOwnersExcluding(db, actor.organizationId, s.id)) === 0) throw new DomainError("VALIDATION", "This is the only owner.");
    }
    await q(`UPDATE staff_member SET active=$2, updated_at=now() WHERE id=$1`, [s.id, input.active], db);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: input.active ? "staff.activate" : "staff.deactivate", targetType: "staff_member", targetId: s.id, changes: {}, correlationId });
    return s;
  });
  if (!input.active) await (await authCtx()).internalAdapter.deleteUserSessions(res.auth_user_id); // sign them out everywhere now
}

/** New one-time password; signs the person out everywhere. Owners' passwords can only be reset by an owner. */
export async function resetStaffPassword(actor: Actor, staffId: string, correlationId: string) {
  assertPermission(actor, "USERS_MANAGE");
  const s = await tx(async (db) => {
    const s = await lockStaff(db, actor, staffId);
    if (s.id === actor.staffId) throw new DomainError("VALIDATION", "Change your own password on the Security page.");
    if (s.roles.includes("OWNER") && !actor.roles.includes("OWNER")) throw new DomainError("FORBIDDEN", "Only an owner can reset an owner's password.");
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "staff.password.reset", targetType: "staff_member", targetId: s.id, changes: {}, correlationId });
    return s;
  });
  const ctx = await authCtx();
  const password = tempPassword();
  await ctx.internalAdapter.updatePassword(s.auth_user_id, await ctx.password.hash(password));
  await ctx.internalAdapter.deleteUserSessions(s.auth_user_id);
  return { tempPassword: password };
}
