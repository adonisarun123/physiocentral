import { tx, q, q1, type Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit } from "@/modules/audit";
import { assertPermission, type Actor, type StaffActor } from "@/modules/auth/actor";
import { slugify } from "@/lib/slug";

/**
 * Clinic team & schedule administration: physiotherapists, the services each
 * can provide, weekly working hours, and dated time off / clinic closures.
 * Online availability is computed from exactly these rows, so every change
 * here is reflected in bookable slots immediately.
 */

export interface Shift { weekday: number; start: string; end: string }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function primaryBranch(db: Db, orgId: string) {
  const b = await q1<{ id: string; timezone: string }>(
    `SELECT id, timezone FROM branch WHERE organization_id=$1 ORDER BY public DESC, created_at LIMIT 1`, [orgId], db);
  if (!b) throw new DomainError("NOT_FOUND", "No clinic location is set up.");
  return b;
}

async function lockTherapist(db: Db, actor: StaffActor, id: string) {
  const t = await q1<{ id: string; resource_id: string; display_name: string; credentials_verified: boolean }>(
    `SELECT id, resource_id, display_name, credentials_verified FROM therapist WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
    [id, actor.organizationId], db);
  if (!t) throw new DomainError("NOT_FOUND", "Physiotherapist not found.");
  return t;
}

/** Validates a weekly schedule: well-formed times, end after start, no overlaps within a day. */
export function validateShifts(shifts: Shift[]): Shift[] {
  const out: Shift[] = [];
  for (const s of shifts) {
    if (!(s.weekday >= 0 && s.weekday <= 6)) throw new DomainError("VALIDATION", "Invalid weekday.");
    if (!HHMM.test(s.start) || !HHMM.test(s.end)) throw new DomainError("VALIDATION", "Enter times as HH:MM, e.g. 09:00.");
    if (s.end <= s.start) throw new DomainError("VALIDATION", `A shift must end after it starts (${s.start}–${s.end}).`);
    out.push(s);
  }
  for (let d = 0; d <= 6; d++) {
    const day = out.filter((s) => s.weekday === d).sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < day.length; i++) {
      if (day[i].start < day[i - 1].end) throw new DomainError("VALIDATION", "Two shifts on the same day overlap.");
    }
  }
  return out;
}

async function replaceShifts(db: Db, resourceId: string, branchId: string, shifts: Shift[]) {
  await db.query(`DELETE FROM availability_rule WHERE resource_id=$1 AND branch_id=$2`, [resourceId, branchId]);
  for (const s of shifts) {
    await db.query(
      `INSERT INTO availability_rule (resource_id, branch_id, weekday, start_local, end_local) VALUES ($1,$2,$3,$4,$5)`,
      [resourceId, branchId, s.weekday, s.start, s.end],
    );
  }
}

async function replaceSkills(db: Db, actor: StaffActor, therapistId: string, serviceIds: string[]) {
  const valid = serviceIds.length
    ? await q<{ id: string }>(`SELECT id FROM service WHERE id = ANY($1::uuid[]) AND organization_id=$2`, [serviceIds, actor.organizationId], db)
    : [];
  if (valid.length !== new Set(serviceIds).size) throw new DomainError("VALIDATION", "One of the selected services was not found.");
  await db.query(`DELETE FROM therapist_skill WHERE therapist_id=$1`, [therapistId]);
  for (const v of valid) await db.query(`INSERT INTO therapist_skill VALUES ($1,$2)`, [therapistId, v.id]);
}

export async function createTherapist(
  actor: Actor,
  input: { displayName: string; designation: string; bio?: string; languages?: string[]; serviceIds: string[]; shifts: Shift[] },
  correlationId: string,
) {
  assertPermission(actor, "SETTINGS_MANAGE");
  const name = input.displayName.trim();
  const designation = input.designation.trim();
  if (name.length < 2) throw new DomainError("VALIDATION", "Enter the physiotherapist's name.", { displayName: "Required" });
  if (designation.length < 2) throw new DomainError("VALIDATION", "Enter a designation, e.g. Physiotherapist.", { designation: "Required" });
  const shifts = validateShifts(input.shifts);
  return tx(async (db) => {
    const branch = await primaryBranch(db, actor.organizationId);
    let slug = slugify(name);
    const taken = await q1(`SELECT 1 FROM therapist WHERE organization_id=$1 AND slug=$2`, [actor.organizationId, slug], db);
    if (taken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const res = (await q1<{ id: string }>(
      `INSERT INTO resource (organization_id, kind, label) VALUES ($1,'THERAPIST',$2) RETURNING id`, [actor.organizationId, name], db))!;
    const t = (await q1<{ id: string }>(
      `INSERT INTO therapist (organization_id, resource_id, slug, display_name, designation, bio, languages, public, credentials_verified, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false,false,true) RETURNING id`,
      [actor.organizationId, res.id, slug, name, designation, input.bio?.trim() || null, input.languages ?? []], db))!;
    await db.query(`INSERT INTO therapist_branch VALUES ($1,$2)`, [t.id, branch.id]);
    await replaceSkills(db, actor, t.id, input.serviceIds);
    await replaceShifts(db, res.id, branch.id, shifts);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "team.therapist.create", targetType: "therapist", targetId: t.id, changes: { name, designation, services: input.serviceIds.length, shifts: shifts.length }, correlationId });
    return { therapistId: t.id };
  });
}

export async function updateTherapistProfile(
  actor: Actor,
  input: { therapistId: string; displayName: string; designation: string; bio?: string; languages?: string[]; credentialsVerified: boolean; public: boolean },
  correlationId: string,
) {
  assertPermission(actor, "SETTINGS_MANAGE");
  if (input.displayName.trim().length < 2) throw new DomainError("VALIDATION", "Enter a name.", { displayName: "Required" });
  if (input.public && !input.credentialsVerified) {
    throw new DomainError("VALIDATION", "Verify registration/qualifications before showing a clinician on the public website.", { public: "Needs verified credentials" });
  }
  return tx(async (db) => {
    const t = await lockTherapist(db, actor, input.therapistId);
    await q(
      `UPDATE therapist SET display_name=$2, designation=$3, bio=$4, languages=$5, credentials_verified=$6, public=$7, updated_at=now() WHERE id=$1`,
      [t.id, input.displayName.trim(), input.designation.trim(), input.bio?.trim() || null, input.languages ?? [], input.credentialsVerified, input.public], db);
    await db.query(`UPDATE resource SET label=$2 WHERE id=$1`, [t.resource_id, input.displayName.trim()]);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "team.therapist.update", targetType: "therapist", targetId: t.id, changes: { credentialsVerified: input.credentialsVerified, public: input.public }, correlationId });
  });
}

/** Deactivating is blocked while the clinician still has upcoming confirmed visits. */
export async function setTherapistActive(actor: Actor, input: { therapistId: string; active: boolean }, correlationId: string) {
  assertPermission(actor, "SETTINGS_MANAGE");
  return tx(async (db) => {
    const t = await lockTherapist(db, actor, input.therapistId);
    if (!input.active) {
      const upcoming = await q1<{ n: number }>(
        `SELECT count(*)::int n FROM appointment WHERE therapist_id=$1 AND starts_at > now() AND status IN ('CONFIRMED','CHECKED_IN','IN_PROGRESS')`, [t.id], db);
      if (upcoming && upcoming.n > 0) {
        throw new DomainError("VALIDATION", `${t.display_name} has ${upcoming.n} upcoming confirmed appointment(s). Cancel or rebook them first.`);
      }
      await db.query(`UPDATE therapist SET public=false WHERE id=$1`, [t.id]);
    }
    await db.query(`UPDATE therapist SET active=$2, updated_at=now() WHERE id=$1`, [t.id, input.active]);
    await db.query(`UPDATE resource SET active=$2 WHERE id=$1`, [t.resource_id, input.active]);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: input.active ? "team.therapist.activate" : "team.therapist.deactivate", targetType: "therapist", targetId: t.id, changes: {}, correlationId });
  });
}

export async function setTherapistServices(actor: Actor, input: { therapistId: string; serviceIds: string[] }, correlationId: string) {
  assertPermission(actor, "SETTINGS_MANAGE");
  return tx(async (db) => {
    const t = await lockTherapist(db, actor, input.therapistId);
    await replaceSkills(db, actor, t.id, input.serviceIds);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "team.therapist.services", targetType: "therapist", targetId: t.id, changes: { services: input.serviceIds }, correlationId });
  });
}

/**
 * Replace a clinician's weekly hours. Existing confirmed appointments are kept
 * (they hold their own reservations); the result reports any that now fall
 * outside the new hours so staff can rebook them.
 */
export async function setTherapistHours(actor: Actor, input: { therapistId: string; shifts: Shift[] }, correlationId: string) {
  assertPermission(actor, "SETTINGS_MANAGE");
  const shifts = validateShifts(input.shifts);
  return tx(async (db) => {
    const t = await lockTherapist(db, actor, input.therapistId);
    const branch = await primaryBranch(db, actor.organizationId);
    await replaceShifts(db, t.resource_id, branch.id, shifts);
    const outside = await q1<{ n: number }>(
      `SELECT count(*)::int n FROM appointment a
        WHERE a.therapist_id=$1 AND a.starts_at > now() AND a.status='CONFIRMED'
          AND NOT EXISTS (SELECT 1 FROM availability_rule r
                           WHERE r.resource_id=$2 AND r.branch_id=$3
                             AND r.weekday = EXTRACT(DOW FROM a.starts_at AT TIME ZONE $4)
                             AND (a.starts_at AT TIME ZONE $4)::time >= r.start_local
                             AND (a.ends_at AT TIME ZONE $4)::time <= r.end_local)`,
      [t.id, t.resource_id, branch.id, branch.timezone], db);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "team.therapist.hours", targetType: "therapist", targetId: t.id, changes: { shifts }, correlationId });
    return { outsideHours: outside?.n ?? 0 };
  });
}

/**
 * Time off for one clinician (therapistId) or a whole-clinic closure (null).
 * Dates are clinic-local; omit times for whole days. Returns how many
 * confirmed appointments fall inside so staff can contact those patients.
 */
export async function addTimeOff(
  actor: Actor,
  input: { therapistId: string | null; fromDate: string; toDate?: string; fromTime?: string; toTime?: string; reason: string },
  correlationId: string,
) {
  assertPermission(actor, "SETTINGS_MANAGE");
  const D = /^\d{4}-\d{2}-\d{2}$/;
  if (!D.test(input.fromDate)) throw new DomainError("VALIDATION", "Choose a start date.", { fromDate: "Required" });
  const toDate = input.toDate && D.test(input.toDate) ? input.toDate : input.fromDate;
  if (toDate < input.fromDate) throw new DomainError("VALIDATION", "The end date is before the start date.");
  const partial = Boolean(input.fromTime || input.toTime);
  if (partial && (!HHMM.test(input.fromTime ?? "") || !HHMM.test(input.toTime ?? ""))) {
    throw new DomainError("VALIDATION", "For part of a day, enter both a from and a to time.");
  }
  if (partial && toDate === input.fromDate && (input.toTime ?? "") <= (input.fromTime ?? "")) {
    throw new DomainError("VALIDATION", "The end time must be after the start time.");
  }
  const reason = input.reason.trim();
  if (reason.length < 2) throw new DomainError("VALIDATION", "Add a short reason, e.g. Diwali or Annual leave.", { reason: "Required" });
  return tx(async (db) => {
    const branch = await primaryBranch(db, actor.organizationId);
    let resourceId: string | null = null;
    let therapistId: string | null = null;
    if (input.therapistId) {
      const t = await lockTherapist(db, actor, input.therapistId);
      resourceId = t.resource_id; therapistId = t.id;
    }
    const startLocal = `${input.fromDate} ${partial ? input.fromTime : "00:00"}`;
    // Whole days end at the next midnight (half-open range).
    const endExpr = partial ? `($3::timestamp AT TIME ZONE $4)` : `(($3::date + 1)::timestamp AT TIME ZONE $4)`;
    const row = (await q1<{ id: string; lo: Date; hi: Date }>(
      `INSERT INTO availability_exception (resource_id, branch_id, blocked, reason, created_by)
       VALUES ($1, $5, tstzrange(($2::timestamp AT TIME ZONE $4), ${endExpr}, '[)'), $6, $7)
       RETURNING id, lower(blocked) lo, upper(blocked) hi`,
      [resourceId, startLocal, partial ? `${toDate} ${input.toTime}` : toDate, branch.timezone, resourceId ? null : branch.id, reason, actor.label], db))!;
    const clash = await q1<{ n: number }>(
      `SELECT count(*)::int n FROM appointment
        WHERE organization_id=$1 AND status IN ('CONFIRMED','REQUESTED')
          AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
          AND ($4::uuid IS NULL OR therapist_id=$4 OR requested_therapist_id=$4)`,
      [actor.organizationId, row.lo, row.hi, therapistId], db);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "schedule.timeoff.add", targetType: "availability_exception", targetId: row.id, changes: { therapistId, from: row.lo, to: row.hi, reason }, correlationId });
    return { clashes: clash?.n ?? 0 };
  });
}

export async function removeTimeOff(actor: Actor, exceptionId: string, correlationId: string) {
  assertPermission(actor, "SETTINGS_MANAGE");
  return tx(async (db) => {
    const row = await q1<{ id: string }>(
      `DELETE FROM availability_exception e
        WHERE e.id=$1 AND (
          e.branch_id IN (SELECT id FROM branch WHERE organization_id=$2)
          OR e.resource_id IN (SELECT id FROM resource WHERE organization_id=$2))
        RETURNING e.id`, [exceptionId, actor.organizationId], db);
    if (!row) throw new DomainError("NOT_FOUND", "That time-off entry was not found.");
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "schedule.timeoff.remove", targetType: "availability_exception", targetId: row.id, changes: {}, correlationId });
  });
}

/** Parse the weekly-hours grid: fields d{0-6}s{1,2} / d{0-6}e{1,2}. Blank pairs mean "off". */
export function shiftsFromForm(fd: FormData): Shift[] {
  const out: Shift[] = [];
  for (let d = 0; d <= 6; d++) {
    for (const k of [1, 2]) {
      const start = String(fd.get(`d${d}s${k}`) ?? "").trim();
      const end = String(fd.get(`d${d}e${k}`) ?? "").trim();
      if (!start && !end) continue;
      if (!start || !end) throw new DomainError("VALIDATION", "Each shift needs both a start and an end time.");
      out.push({ weekday: d, start: start.slice(0, 5), end: end.slice(0, 5) });
    }
  }
  return out;
}
