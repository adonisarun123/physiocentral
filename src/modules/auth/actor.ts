import { DomainError } from "@/lib/errors";
import { q, type Db } from "@/lib/db";
import { permissionsFor, type Permission } from "./permissions";

/** The authenticated, authorized principal passed into every domain service. */
export interface StaffActor {
  kind: "staff";
  staffId: string;
  organizationId: string;
  displayName: string;
  authUserId: string;
  roles: string[];
  permissions: Set<Permission>;
  label: string; // for audit/events: "staff:<id>"
}

export interface PatientLinkActor {
  kind: "patient_link";
  appointmentId: string;
  label: string;
}

export interface SystemActor {
  kind: "system";
  label: string;
}

export type Actor = StaffActor | PatientLinkActor | SystemActor;

export async function loadStaffActor(authUserId: string, db?: Db): Promise<StaffActor | null> {
  const rows = await q<{ id: string; organization_id: string; display_name: string; active: boolean; roles: string[] | null }>(
    `SELECT s.id, s.organization_id, s.display_name, s.active,
            array_agg(g.role) FILTER (WHERE g.role IS NOT NULL) AS roles
       FROM staff_member s LEFT JOIN role_grant g ON g.staff_member_id = s.id
      WHERE s.auth_user_id = $1
      GROUP BY s.id`,
    [authUserId],
    db,
  );
  const r = rows[0];
  if (!r || !r.active) return null;
  const roles = r.roles ?? [];
  return {
    kind: "staff",
    staffId: r.id,
    organizationId: r.organization_id,
    displayName: r.display_name,
    authUserId,
    roles,
    permissions: permissionsFor(roles),
    label: `staff:${r.id}`,
  };
}

export function assertPermission(actor: Actor, perm: Permission): asserts actor is StaffActor {
  if (actor.kind !== "staff") throw new DomainError("FORBIDDEN", "You do not have permission for this action.");
  if (!actor.permissions.has(perm)) {
    throw new DomainError("FORBIDDEN", "You do not have permission for this action.");
  }
}

export function can(actor: StaffActor | null | undefined, perm: Permission): boolean {
  return !!actor && actor.permissions.has(perm);
}
