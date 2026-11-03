import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { getPool } from "@/lib/db";
import { permissionsFor, type Role } from "@/modules/auth/permissions";
import type { StaffActor } from "@/modules/auth/actor";
import { findSlots } from "@/modules/scheduling/availability";

/**
 * Integration tests run against REAL PostgreSQL (local or a Neon test branch),
 * never an in-memory imitation (§25.2). The schema is rebuilt from the actual
 * migration files. Point DATABASE_URL at a disposable database.
 */
export async function resetDatabase(applyMigrations = true) {
  const url = process.env.DATABASE_URL!;
  if (!url) throw new Error("DATABASE_URL required for integration tests");
  if (process.env.ALLOW_DB_RESET !== "1") throw new Error("Refusing to reset: set ALLOW_DB_RESET=1 for a disposable test database");
  const c = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || url });
  await c.connect();
  await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  if (!applyMigrations) return void (await c.end());
  const dir = path.join(process.cwd(), "db", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await c.query(readFileSync(path.join(dir, f), "utf8"));
  }
  await c.end();
}

export interface Fixture {
  orgId: string;
  branchA: string;
  branchB: string;
  therapist1: string;
  therapist2: string;
  sessionSvc: string;
  materialsSvc: string;
  owner: StaffActor;
  receptionist: StaffActor;
  billing: StaffActor;
  physio: StaffActor;
}

export async function buildFixture(): Promise<Fixture> {
  const db = getPool();
  const one = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0];
  const org = await one(`INSERT INTO organization (trade_name, identity_verified) VALUES ('Test Clinic', true) RETURNING id`);
  const mkBranch = (slug: string) =>
    one(`INSERT INTO branch (organization_id, slug, name, public, booking_lead_minutes) VALUES ($1,$2,$3,true,60) RETURNING id`, [org.id, slug, slug]);
  const bA = await mkBranch("a");
  const bB = await mkBranch("b");
  const mkTherapist = async (name: string) => {
    const r = await one(`INSERT INTO resource (organization_id, kind, label) VALUES ($1,'THERAPIST',$2) RETURNING id`, [org.id, name]);
    const t = await one(
      `INSERT INTO therapist (organization_id, resource_id, slug, display_name, designation, public, credentials_verified)
       VALUES ($1,$2,$3,$4,'Physiotherapist',true,true) RETURNING id`,
      [org.id, r.id, name.toLowerCase(), name],
    );
    for (const b of [bA.id, bB.id]) {
      await db.query(`INSERT INTO therapist_branch VALUES ($1,$2)`, [t.id, b]);
      for (let d = 0; d < 7; d++) {
        await db.query(`INSERT INTO availability_rule (resource_id, branch_id, weekday, start_local, end_local) VALUES ($1,$2,$3,'06:00','22:00')`, [r.id, b, d]);
      }
    }
    return t.id as string;
  };
  const t1 = await mkTherapist("Asha");
  const t2 = await mkTherapist("Ravi");
  const mkService = async (code: string, unit: string, minutes: number, paise: number, reviewer: boolean) => {
    const s = await one(
      `INSERT INTO service (organization_id, code, slug, name, status, public, bookable, billing_unit, duration_minutes, buffer_after_minutes,
         clinical_reviewer, reviewed_on)
       VALUES ($1,$2,$3,$4,'ACTIVE',$5,$5,$6,$7,15,$8,$9) RETURNING id`,
      [org.id, code, code.toLowerCase(), code, reviewer, unit, minutes, reviewer ? "Reviewer" : null, reviewer ? "2026-11-01" : null],
    );
    for (const b of [bA.id, bB.id]) await db.query(`INSERT INTO service_branch VALUES ($1,$2)`, [s.id, b]);
    for (const t of [t1, t2]) await db.query(`INSERT INTO therapist_skill VALUES ($1,$2)`, [t, s.id]);
    await db.query(
      `INSERT INTO service_price_version (service_id, valid_during, unit_price_paise) VALUES ($1, tstzrange(now() - interval '1 day', NULL, '[)'), $2)`,
      [s.id, paise],
    );
    return s.id as string;
  };
  const sessionSvc = await mkService("SESSION", "Session", 45, 100000, true);
  const materialsSvc = await mkService("MATERIALS", "Item", 5, 20000, true);

  const mkActor = async (role: Role): Promise<StaffActor> => {
    const s = await one(`INSERT INTO staff_member (organization_id, auth_user_id, display_name) VALUES ($1,$2,$3) RETURNING id`, [org.id, randomUUID(), role]);
    await db.query(`INSERT INTO role_grant (organization_id, staff_member_id, role) VALUES ($1,$2,$3)`, [org.id, s.id, role]);
    return { kind: "staff", staffId: s.id, organizationId: org.id, displayName: role, authUserId: "x", roles: [role], permissions: permissionsFor([role]), label: `staff:${s.id}` };
  };
  return {
    orgId: org.id, branchA: bA.id, branchB: bB.id, therapist1: t1, therapist2: t2, sessionSvc, materialsSvc,
    owner: await mkActor("OWNER"), receptionist: await mkActor("RECEPTIONIST"), billing: await mkActor("BILLING"), physio: await mkActor("PHYSIOTHERAPIST"),
  };
}

/** A real future slot for a therapist (tomorrow, local time), from the live availability engine. */
export async function futureSlot(f: Fixture, branchId: string, therapistId: string, day: number, index = 0): Promise<string> {
  const tomorrow = (await getPool().query(`SELECT to_char((now() AT TIME ZONE 'Asia/Kolkata')::date + 1 + $1::int, 'YYYY-MM-DD') AS d`, [day])).rows[0].d;
  const slots = await findSlots({ branchId, serviceId: f.sessionSvc, therapistId, date: tomorrow, enforceLeadTime: true });
  if (!slots[index]) throw new Error("no slot available in fixture");
  return new Date(slots[index].starts_at).toISOString();
}

export function bookingPayload(f: Fixture, overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    branchId: f.branchA,
    serviceId: f.sessionSvc,
    therapistId: null,
    fullName: "Test Patient",
    phone: "98765 43210",
    email: "",
    isNewPatient: "yes",
    reasonBrief: "",
    accessibilityNeeds: "",
    privacyAck: true,
    marketingOptIn: false,
    ...overrides,
  };
}

export const ctx = { source: "WEB" as const, actorLabel: "public:web", correlationId: "test" };
