import { getPool, q, q1, tx } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit } from "@/modules/audit";
import { assertPermission, type Actor, type StaffActor } from "@/modules/auth/actor";
import { assertCareTeam } from "./access";

/**
 * Exercise library and home exercise sheets.
 *  - The library is the clinic's own list, written by its physios. Nothing is
 *    pre-loaded: exercise instructions are clinical content.
 *  - A sheet copies each exercise's name and instructions when it is issued, so
 *    editing the library later never changes what a patient was given. Sheets are
 *    never edited; the physio issues a new one and stops the old one.
 */

const UUID = /^[0-9a-f-]{36}$/i;

function intIn(v: number | null | undefined, min: number, max: number, field: string, label: string, fe: Record<string, string>) {
  if (v === null || v === undefined) return null;
  if (!Number.isInteger(v) || v < min || v > max) { fe[field] = `${label} must be ${min}–${max}`; return null; }
  return v;
}

// ───────────── Library ─────────────

export interface ExerciseInput {
  id?: string | null; name: string; bodyRegion?: string; instructions: string;
  sets?: number | null; reps?: number | null; holdSeconds?: number | null;
}

export async function saveExercise(actor: Actor, input: ExerciseInput, correlationId: string) {
  assertPermission(actor, "CLINICAL_NOTES_WRITE");
  const fe: Record<string, string> = {};
  const name = input.name.trim();
  const instructions = input.instructions.trim();
  if (name.length < 2 || name.length > 120) fe.name = "Name must be 2–120 characters";
  if (instructions.length < 2 || instructions.length > 1500) fe.instructions = "Instructions must be 2–1500 characters";
  const sets = intIn(input.sets, 1, 20, "sets", "Sets", fe);
  const reps = intIn(input.reps, 1, 200, "reps", "Reps", fe);
  const hold = intIn(input.holdSeconds, 1, 600, "holdSeconds", "Hold", fe);
  if (Object.keys(fe).length) throw new DomainError("VALIDATION", "Please correct the highlighted fields.", fe);
  const region = input.bodyRegion?.trim().slice(0, 60) || null;
  return tx(async (db) => {
    try {
      if (input.id) {
        if (!UUID.test(input.id)) throw new DomainError("NOT_FOUND", "Exercise not found.");
        const row = await q1<{ id: string }>(
          `UPDATE exercise SET name=$3, body_region=$4, instructions=$5, default_sets=$6, default_reps=$7, default_hold_seconds=$8, updated_at=now()
            WHERE id=$1 AND organization_id=$2 RETURNING id`,
          [input.id, actor.organizationId, name, region, instructions, sets, reps, hold], db);
        if (!row) throw new DomainError("NOT_FOUND", "Exercise not found.");
        await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "clinical.exercise.update", targetType: "exercise", targetId: row.id, correlationId });
        return { exerciseId: row.id };
      }
      const row = (await q1<{ id: string }>(
        `INSERT INTO exercise (organization_id, name, body_region, instructions, default_sets, default_reps, default_hold_seconds, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [actor.organizationId, name, region, instructions, sets, reps, hold, actor.label], db))!;
      await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "clinical.exercise.create", targetType: "exercise", targetId: row.id, correlationId });
      return { exerciseId: row.id };
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new DomainError("DUPLICATE", "An exercise with that name is already in the library.", { name: "Already exists" });
      throw e;
    }
  });
}

export async function setExerciseActive(actor: Actor, input: { exerciseId: string; active: boolean }, correlationId: string) {
  assertPermission(actor, "CLINICAL_NOTES_WRITE");
  if (!UUID.test(input.exerciseId)) throw new DomainError("NOT_FOUND", "Exercise not found.");
  return tx(async (db) => {
    const row = await q1<{ id: string }>(`UPDATE exercise SET active=$3, updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id`,
      [input.exerciseId, actor.organizationId, input.active], db);
    if (!row) throw new DomainError("NOT_FOUND", "Exercise not found.");
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: input.active ? "clinical.exercise.restore" : "clinical.exercise.hide", targetType: "exercise", targetId: row.id, correlationId });
  });
}

export interface ExerciseRow {
  id: string; name: string; body_region: string | null; instructions: string;
  default_sets: number | null; default_reps: number | null; default_hold_seconds: number | null; active: boolean;
}

export function listExercises(actor: StaffActor, opts: { includeHidden?: boolean } = {}) {
  assertPermission(actor, "CLINICAL_NOTES_READ");
  return q<ExerciseRow>(
    `SELECT id, name, body_region, instructions, default_sets, default_reps, default_hold_seconds, active
       FROM exercise WHERE organization_id=$1 AND ($2 OR active) ORDER BY active DESC, body_region NULLS LAST, lower(name)`,
    [actor.organizationId, !!opts.includeHidden]);
}

// ───────────── Sheets ─────────────

export interface ProgrammeItemInput {
  exerciseId?: string | null; name?: string; instructions?: string;
  sets?: number | null; reps?: number | null; holdSeconds?: number | null;
  timesPerDay?: number | null; daysPerWeek?: number | null; note?: string;
}

export interface ProgrammeInput {
  patientId: string; episodeId?: string | null; title: string; advice?: string; items: ProgrammeItemInput[];
}

const blank = (i: ProgrammeItemInput) => !i.exerciseId && !i.name?.trim() && !i.instructions?.trim();

export async function createHomeProgramme(actor: Actor, input: ProgrammeInput, correlationId: string) {
  const { therapistId, patient, actor: staff } = await assertCareTeam(actor, input.patientId, "CLINICAL_NOTES_WRITE");
  const fe: Record<string, string> = {};
  const title = input.title.trim();
  if (title.length < 2 || title.length > 120) fe.title = "Give the sheet a short title";
  const advice = input.advice?.trim().slice(0, 1500) || null;
  const rows = input.items.filter((i) => !blank(i));
  if (rows.length === 0) fe.items = "Add at least one exercise";
  if (rows.length > 30) fe.items = "Up to 30 exercises per sheet";
  if (Object.keys(fe).length) throw new DomainError("VALIDATION", "Please correct the highlighted fields.", fe);

  return tx(async (db) => {
    if (input.episodeId) {
      const ep = await q1<{ id: string }>(`SELECT id FROM care_episode WHERE id=$1 AND patient_id=$2`, [input.episodeId, patient.id], db);
      if (!ep) throw new DomainError("VALIDATION", "That episode doesn't belong to this patient.");
    }
    const ids = rows.map((r) => r.exerciseId).filter((x): x is string => !!x && UUID.test(x));
    const lib = ids.length ? await q<ExerciseRow>(
      `SELECT id, name, body_region, instructions, default_sets, default_reps, default_hold_seconds, active FROM exercise WHERE organization_id=$1 AND id = ANY($2::uuid[])`,
      [staff.organizationId, ids], db) : [];
    const items = rows.map((r, idx) => {
      const n = idx + 1;
      const ex = r.exerciseId ? lib.find((l) => l.id === r.exerciseId) : undefined;
      if (r.exerciseId && !ex) fe[`row${n}`] = `Row ${n}: that exercise is no longer in the library`;
      const name = (r.name?.trim() || ex?.name || "").slice(0, 120);
      const instructions = (r.instructions?.trim() || ex?.instructions || "").slice(0, 1500);
      if (name.length < 2) fe[`row${n}`] = `Row ${n}: name the exercise`;
      else if (instructions.length < 2) fe[`row${n}`] = `Row ${n}: add instructions`;
      return {
        exerciseId: ex?.id ?? null, name, instructions,
        sets: intIn(r.sets ?? ex?.default_sets ?? null, 1, 20, `row${n}`, `Row ${n} sets`, fe),
        reps: intIn(r.reps ?? ex?.default_reps ?? null, 1, 200, `row${n}`, `Row ${n} reps`, fe),
        hold: intIn(r.holdSeconds ?? ex?.default_hold_seconds ?? null, 1, 600, `row${n}`, `Row ${n} hold`, fe),
        perDay: intIn(r.timesPerDay ?? null, 1, 12, `row${n}`, `Row ${n} times a day`, fe),
        perWeek: intIn(r.daysPerWeek ?? null, 1, 7, `row${n}`, `Row ${n} days a week`, fe),
        note: r.note?.trim().slice(0, 300) || null,
      };
    });
    if (Object.keys(fe).length) throw new DomainError("VALIDATION", "Please correct the highlighted rows.", fe);

    const prog = (await q1<{ id: string }>(
      `INSERT INTO home_programme (organization_id, patient_id, episode_id, title, advice, therapist_id, author_name, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [staff.organizationId, patient.id, input.episodeId || null, title, advice, therapistId, staff.displayName, staff.label], db))!;
    for (const [i, it] of items.entries()) {
      await db.query(
        `INSERT INTO home_programme_item (programme_id, position, exercise_id, name, instructions, sets, reps, hold_seconds, times_per_day, days_per_week, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [prog.id, i + 1, it.exerciseId, it.name, it.instructions, it.sets, it.reps, it.hold, it.perDay, it.perWeek, it.note]);
    }
    await audit(db, { organizationId: staff.organizationId, actor: staff.label, action: "clinical.hep.create", targetType: "patient", targetId: patient.id,
      changes: { programmeId: prog.id, exercises: items.length }, correlationId });
    return { programmeId: prog.id };
  });
}

export async function stopHomeProgramme(actor: Actor, input: { programmeId: string }, correlationId: string) {
  assertPermission(actor, "CLINICAL_NOTES_WRITE");
  if (!UUID.test(input.programmeId)) throw new DomainError("NOT_FOUND", "Sheet not found.");
  return tx(async (db) => {
    const p = await q1<{ id: string; patient_id: string; status: string }>(
      `SELECT h.id, h.patient_id, h.status FROM home_programme h WHERE h.id=$1 AND h.organization_id=$2 FOR UPDATE`,
      [input.programmeId, (actor as StaffActor).organizationId], db);
    if (!p) throw new DomainError("NOT_FOUND", "Sheet not found.");
    const { actor: staff } = await assertCareTeam(actor, p.patient_id, "CLINICAL_NOTES_WRITE", db);
    if (p.status === "STOPPED") return;
    await db.query(`UPDATE home_programme SET status='STOPPED', stopped_at=now(), stopped_by=$2 WHERE id=$1`, [p.id, staff.label]);
    await audit(db, { organizationId: staff.organizationId, actor: staff.label, action: "clinical.hep.stop", targetType: "patient", targetId: p.patient_id,
      changes: { programmeId: p.id }, correlationId });
  });
}

export interface ProgrammeSummary {
  id: string; title: string; status: string; created_at: Date; author_name: string; episode_title: string | null; items: number;
}

export async function listHomeProgrammes(actor: StaffActor, patientId: string): Promise<ProgrammeSummary[]> {
  const { patient } = await assertCareTeam(actor, patientId, "CLINICAL_NOTES_READ");
  return q<ProgrammeSummary>(
    `SELECT h.id, h.title, h.status, h.created_at, h.author_name, e.title episode_title,
            (SELECT count(*)::int FROM home_programme_item i WHERE i.programme_id=h.id) items
       FROM home_programme h LEFT JOIN care_episode e ON e.id=h.episode_id
      WHERE h.patient_id=$1 ORDER BY (h.status='ACTIVE') DESC, h.created_at DESC`, [patient.id]);
}

export interface ProgrammeSheet {
  id: string; title: string; advice: string | null; status: string; created_at: Date; author_name: string;
  patient: { id: string; full_name: string; op_number: number | null; public_ref: string };
  clinic: { name: string; phone: string | null; address: string | null };
  items: { position: number; name: string; instructions: string; sets: number | null; reps: number | null; hold_seconds: number | null;
    times_per_day: number | null; days_per_week: number | null; note: string | null }[];
}

/** One sheet, for viewing and printing. Checks chart access and logs the view. */
export async function getHomeProgramme(actor: StaffActor, programmeId: string): Promise<ProgrammeSheet> {
  if (!UUID.test(programmeId)) throw new DomainError("NOT_FOUND", "Sheet not found.");
  const h = await q1<{ id: string; patient_id: string; title: string; advice: string | null; status: string; created_at: Date; author_name: string }>(
    `SELECT id, patient_id, title, advice, status, created_at, author_name FROM home_programme WHERE id=$1 AND organization_id=$2`,
    [programmeId, actor.organizationId]);
  if (!h) throw new DomainError("NOT_FOUND", "Sheet not found.");
  const { patient } = await assertCareTeam(actor, h.patient_id, "CLINICAL_NOTES_READ");
  const [items, clinic] = await Promise.all([
    q<ProgrammeSheet["items"][number]>(
      `SELECT position, name, instructions, sets, reps, hold_seconds, times_per_day, days_per_week, note
         FROM home_programme_item WHERE programme_id=$1 ORDER BY position`, [h.id]),
    q1<{ name: string; phone: string | null; address: string | null }>(
      `SELECT o.trade_name AS name, COALESCE(b.phone_e164, o.phone_e164) AS phone,
              NULLIF(concat_ws(', ', b.address_line, b.locality, b.city), '') AS address
         FROM organization o LEFT JOIN LATERAL (SELECT * FROM branch WHERE organization_id=o.id ORDER BY public DESC, created_at LIMIT 1) b ON true
        WHERE o.id=$1`, [actor.organizationId]),
  ]);
  await audit(getPool(), { organizationId: actor.organizationId, actor: actor.label, action: "clinical.hep.view", targetType: "patient", targetId: h.patient_id,
    changes: { programmeId: h.id, wideAccess: actor.permissions.has("CLINICAL_RECORDS_ALL") } });
  const { patient_id: _p, ...rest } = h;
  void _p;
  return { ...rest, patient, clinic: clinic ?? { name: "", phone: null, address: null }, items };
}

/** "3 sets × 10 reps · hold 5 s · 2× a day · 5 days a week" */
export function dosageLine(i: { sets: number | null; reps: number | null; hold_seconds: number | null; times_per_day: number | null; days_per_week: number | null }) {
  const parts: string[] = [];
  if (i.sets && i.reps) parts.push(`${i.sets} set${i.sets === 1 ? "" : "s"} × ${i.reps} rep${i.reps === 1 ? "" : "s"}`);
  else if (i.sets) parts.push(`${i.sets} set${i.sets === 1 ? "" : "s"}`);
  else if (i.reps) parts.push(`${i.reps} rep${i.reps === 1 ? "" : "s"}`);
  if (i.hold_seconds) parts.push(`hold ${i.hold_seconds} s`);
  if (i.times_per_day) parts.push(i.times_per_day === 1 ? "once a day" : `${i.times_per_day} times a day`);
  if (i.days_per_week) parts.push(i.days_per_week === 7 ? "every day" : `${i.days_per_week} days a week`);
  return parts.join(" · ");
}
