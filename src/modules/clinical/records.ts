import type { PoolClient } from "pg";
import { q, q1, tx, pgErrorCode, type Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit } from "@/modules/audit";
import { assertPermission, type Actor } from "@/modules/auth/actor";
import { assertCareTeam } from "./access";
import { BODY_REGIONS, GOAL_STATUSES, MEASUREMENT_KINDS, SIDES, UNITS, type GoalStatus, type Unit } from "./constants";

/*
 * Clinical record writes (features #2–#4). Every write re-checks permission and
 * care-team membership inside the transaction. Audit events record who did
 * what to which record, never the clinical text itself.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(v: string | null | undefined, max: number, label: string, field: string, opts: { required?: boolean; min?: number } = {}) {
  const t = (v ?? "").trim();
  if (!t) {
    if (opts.required) throw new DomainError("VALIDATION", `${label} is required.`, { [field]: "Required" });
    return null;
  }
  if (opts.min && t.length < opts.min) throw new DomainError("VALIDATION", `${label} is too short.`, { [field]: "Too short" });
  if (t.length > max) throw new DomainError("VALIDATION", `${label} is too long (max ${max} characters).`, { [field]: "Too long" });
  return t;
}

function date(v: string | null | undefined, label: string, field: string, required = false) {
  const t = (v ?? "").trim();
  if (!t) {
    if (required) throw new DomainError("VALIDATION", `${label} is required.`, { [field]: "Required" });
    return null;
  }
  if (!ISO_DATE.test(t) || Number.isNaN(Date.parse(`${t}T00:00:00Z`))) throw new DomainError("VALIDATION", `Enter ${label.toLowerCase()} as a date.`, { [field]: "Invalid date" });
  return t;
}

function region(v: string | null | undefined, required: boolean) {
  const t = (v ?? "").trim();
  if (!t) {
    if (required) throw new DomainError("VALIDATION", "Choose the body region.", { bodyRegion: "Required" });
    return null;
  }
  if (!(BODY_REGIONS as readonly string[]).includes(t)) throw new DomainError("VALIDATION", "Choose a body region from the list.", { bodyRegion: "Invalid" });
  return t;
}

function side(v: string | null | undefined, required: boolean) {
  const t = (v ?? "").trim().toUpperCase();
  if (!t) {
    if (required) throw new DomainError("VALIDATION", "Choose the side.", { side: "Required" });
    return null;
  }
  if (!SIDES.some((s) => s.value === t)) throw new DomainError("VALIDATION", "Choose the side from the list.", { side: "Invalid" });
  return t;
}

/** Local calendar date of an appointment in its branch's timezone. */
async function appointmentLocalDate(db: Db, appointmentId: string) {
  return (await q1<{ d: string }>(
    `SELECT to_char((a.starts_at AT TIME ZONE b.timezone)::date, 'YYYY-MM-DD') d FROM appointment a JOIN branch b ON b.id=a.branch_id WHERE a.id=$1`,
    [appointmentId], db))?.d ?? null;
}

async function todayFor(db: Db, organizationId: string) {
  return (await q1<{ d: string }>(`SELECT to_char((now() AT TIME ZONE timezone)::date,'YYYY-MM-DD') d FROM organization WHERE id=$1`, [organizationId], db))!.d;
}

interface EpisodeRow { id: string; patient_id: string; status: string; opened_on: string; title: string }

/** Lock an episode in the actor's organisation and check care-team access to its patient. */
async function episodeForWrite(db: PoolClient, actor: Actor, episodeId: string, needOpen = true) {
  assertPermission(actor, "CLINICAL_NOTES_WRITE");
  if (!/^[0-9a-f-]{36}$/i.test(episodeId)) throw new DomainError("NOT_FOUND", "Episode not found.");
  const ep = await q1<EpisodeRow>(
    `SELECT id, patient_id, status, to_char(opened_on,'YYYY-MM-DD') opened_on, title FROM care_episode WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
    [episodeId, actor.organizationId], db);
  if (!ep) throw new DomainError("NOT_FOUND", "Episode not found.");
  const team = await assertCareTeam(actor, ep.patient_id, "CLINICAL_NOTES_WRITE", db);
  if (needOpen && ep.status !== "OPEN") throw new DomainError("INVALID_TRANSITION", "This episode has been discharged. Start a new episode for further care.");
  return { ep, ...team };
}

/** An optional visit reference must be one of this patient's visits. */
async function checkVisit(db: Db, organizationId: string, patientId: string, appointmentId: string | null | undefined) {
  if (!appointmentId) return null;
  if (!/^[0-9a-f-]{36}$/i.test(appointmentId)) throw new DomainError("NOT_FOUND", "Appointment not found.");
  const a = await q1<{ id: string }>(`SELECT id FROM appointment WHERE id=$1 AND organization_id=$2 AND patient_id=$3`, [appointmentId, organizationId, patientId], db);
  if (!a) throw new DomainError("NOT_FOUND", "Appointment not found for this patient.");
  return a.id;
}

// ─────────────────────────── Episodes ───────────────────────────

export interface EpisodeInput {
  patientId: string;
  title: string;
  bodyRegion?: string | null;
  side?: string | null;
  workingDiagnosis?: string | null;
  referrer?: string | null;
  openedOn?: string | null;
  /** Attach the patient's pre-episode diagnosis / protocol text after review. */
  attachLegacy?: boolean;
  /** File this visit under the new episode. */
  appointmentId?: string | null;
}

export async function createEpisode(actor: Actor, input: EpisodeInput, correlationId: string) {
  const title = text(input.title, 120, "Episode name", "title", { required: true, min: 2 })!;
  const bodyRegion = region(input.bodyRegion, false);
  const sd = side(input.side, false);
  const dx = text(input.workingDiagnosis, 2000, "Working diagnosis", "workingDiagnosis");
  const referrer = text(input.referrer, 200, "Referrer", "referrer");
  const openedOnIn = date(input.openedOn, "Start date", "openedOn");
  return tx(async (db) => {
    const { therapistId, actor: a, patient } = await assertCareTeam(actor, input.patientId, "CLINICAL_NOTES_WRITE", db);
    await q(`SELECT id FROM patient WHERE id=$1 FOR UPDATE`, [patient.id], db);
    const visit = await checkVisit(db, a.organizationId, patient.id, input.appointmentId);
    // Default: the visit's date, but never later than today (a visit booked ahead must not push the start into the future).
    const today = await todayFor(db, a.organizationId);
    const visitDay = visit ? await appointmentLocalDate(db, visit) : null;
    const openedOn = openedOnIn ?? (visitDay && visitDay < today ? visitDay : today);
    let legacy: string | null = null;
    if (input.attachLegacy) {
      const p = (await q1<{ diagnosis: string | null; treatment_protocol: string | null }>(`SELECT diagnosis, treatment_protocol FROM patient WHERE id=$1`, [patient.id], db))!;
      const parts = [p.diagnosis ? `Diagnosis: ${p.diagnosis}` : null, p.treatment_protocol ? `Treatment protocol: ${p.treatment_protocol}` : null].filter(Boolean);
      if (!parts.length) throw new DomainError("VALIDATION", "There is no earlier diagnosis or protocol text on this patient to attach.");
      legacy = parts.join("\n\n");
    }
    const ep = (await q1<{ id: string }>(
      `INSERT INTO care_episode (organization_id, patient_id, title, body_region, side, working_diagnosis, referrer, lead_therapist_id, opened_on,
         legacy_summary, legacy_reviewed_by, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11,$12) RETURNING id`,
      [a.organizationId, patient.id, title, bodyRegion, sd, dx, referrer, therapistId, openedOn, legacy,
        legacy ? `${a.displayName} on ${today}` : null, a.label], db))!;
    if (visit) await linkVisit(db, visit, ep.id);
    await audit(db, { organizationId: a.organizationId, actor: a.label, action: "clinical.episode.create", targetType: "care_episode", targetId: ep.id,
      changes: { patientId: patient.id, legacyAttached: !!legacy, appointmentId: visit }, correlationId });
    return { episodeId: ep.id };
  });
}

async function linkVisit(db: Db, appointmentId: string, episodeId: string) {
  const note = await q1<{ episode_id: string }>(`SELECT episode_id FROM clinical_note WHERE appointment_id=$1`, [appointmentId], db);
  if (note && note.episode_id !== episodeId) throw new DomainError("INVALID_TRANSITION", "This visit already has a note filed under another episode.");
  // Not an appointment version bump: the episode is clinical filing, not a booking change reception could collide with.
  await q(`UPDATE appointment SET episode_id=$2, updated_at=now() WHERE id=$1`, [appointmentId, episodeId], db);
}

export async function linkAppointmentToEpisode(actor: Actor, input: { appointmentId: string; episodeId: string }, correlationId: string) {
  return tx(async (db) => {
    const { ep, actor: a } = await episodeForWrite(db, actor, input.episodeId);
    const visit = await checkVisit(db, a.organizationId, ep.patient_id, input.appointmentId);
    await q(`SELECT id FROM appointment WHERE id=$1 FOR UPDATE`, [visit], db);
    await linkVisit(db, visit!, ep.id);
    await audit(db, { organizationId: a.organizationId, actor: a.label, action: "clinical.episode.link_visit", targetType: "appointment", targetId: visit, changes: { episodeId: ep.id }, correlationId });
  });
}

export async function dischargeEpisode(actor: Actor, input: { episodeId: string; closedOn?: string | null; summary: string }, correlationId: string) {
  const summary = text(input.summary, 4000, "Discharge summary", "summary", { required: true, min: 5 })!;
  const closedIn = date(input.closedOn, "Discharge date", "closedOn");
  return tx(async (db) => {
    const { ep, actor: a } = await episodeForWrite(db, actor, input.episodeId);
    const drafts = await q1<{ n: string }>(`SELECT count(*)::text n FROM clinical_note WHERE episode_id=$1 AND status='DRAFT'`, [ep.id], db);
    if (drafts!.n !== "0") throw new DomainError("INVALID_TRANSITION", "Sign the draft session notes in this episode before discharging it.");
    const closedOn = closedIn ?? (await todayFor(db, a.organizationId));
    if (closedOn < ep.opened_on) throw new DomainError("VALIDATION", "The discharge date is before the episode started.", { closedOn: "Too early" });
    await q(`UPDATE care_episode SET status='DISCHARGED', closed_on=$2::date, discharge_summary=$3, updated_at=now() WHERE id=$1`, [ep.id, closedOn, summary], db);
    await audit(db, { organizationId: a.organizationId, actor: a.label, action: "clinical.episode.discharge", targetType: "care_episode", targetId: ep.id, correlationId });
  });
}

// ─────────────────────────── Intake ───────────────────────────

export interface IntakeInput {
  patientId: string;
  submissionKey: string;
  episodeId?: string | null;
  appointmentId?: string | null;
  mainConcern: string;
  relevantHistory?: string | null;
  patientGoal?: string | null;
  referrer?: string | null;
  preferredLanguage?: string | null;
  treatmentConsent: boolean;
}

/**
 * Intake at reception (or by the treating therapist). Submitting the same form
 * twice — a double tap, a retry after a dropped connection — stores it once.
 * Reception can submit an intake but cannot read intakes back: that is clinical.
 */
export async function recordIntake(actor: Actor, input: IntakeInput, correlationId: string) {
  if (actor.kind !== "staff") throw new DomainError("FORBIDDEN", "You do not have permission for this action.");
  if (!actor.permissions.has("PATIENT_CONTACT_VIEW")) assertPermission(actor, "CLINICAL_NOTES_WRITE");
  const key = (input.submissionKey ?? "").trim();
  if (!/^[\w-]{8,100}$/.test(key)) throw new DomainError("VALIDATION", "This form has expired. Reload the page and try again.");
  const mainConcern = text(input.mainConcern, 1000, "Main concern", "mainConcern", { required: true, min: 2 })!;
  const history = text(input.relevantHistory, 3000, "Relevant history", "relevantHistory");
  const goal = text(input.patientGoal, 500, "Patient's goal", "patientGoal");
  const referrer = text(input.referrer, 200, "Referred by", "referrer");
  const language = text(input.preferredLanguage, 40, "Preferred language", "preferredLanguage");
  return tx(async (db) => {
    if (!actor.permissions.has("PATIENT_CONTACT_VIEW")) await assertCareTeam(actor, input.patientId, "CLINICAL_NOTES_WRITE", db);
    const p = /^[0-9a-f-]{36}$/i.test(input.patientId)
      ? await q1<{ id: string }>(`SELECT id FROM patient WHERE id=$1 AND organization_id=$2 AND NOT archived`, [input.patientId, actor.organizationId], db) : undefined;
    if (!p) throw new DomainError("NOT_FOUND", "Patient not found.");
    let episodeId: string | null = null;
    if (input.episodeId) {
      const ep = await q1<{ id: string }>(`SELECT id FROM care_episode WHERE id=$1 AND patient_id=$2 AND status='OPEN'`, [input.episodeId, p.id], db);
      if (!ep) throw new DomainError("NOT_FOUND", "Episode not found for this patient.");
      episodeId = ep.id;
    }
    const visit = await checkVisit(db, actor.organizationId, p.id, input.appointmentId);
    const ins = await q1<{ id: string }>(
      `INSERT INTO intake_submission (organization_id, patient_id, episode_id, appointment_id, submission_key, main_concern, relevant_history,
         patient_goal, referrer, preferred_language, treatment_consent, channel, submitted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'RECEPTION',$12)
       ON CONFLICT (organization_id, submission_key) DO NOTHING RETURNING id`,
      [actor.organizationId, p.id, episodeId, visit, key, mainConcern, history, goal, referrer, language, !!input.treatmentConsent, actor.label], db);
    if (!ins) {
      const prior = await q1<{ id: string; patient_id: string }>(`SELECT id, patient_id FROM intake_submission WHERE organization_id=$1 AND submission_key=$2`, [actor.organizationId, key], db);
      if (!prior || prior.patient_id !== p.id) throw new DomainError("IDEMPOTENCY_CONFLICT", "This form was already used for another patient. Reload the page.");
      return { intakeId: prior.id, duplicate: true };
    }
    await q(
      `INSERT INTO consent_record (organization_id, patient_id, purpose, granted, notice_version, method, actor)
       VALUES ($1,$2,'TREATMENT',$3,'intake-2026-11','STAFF_IN_PERSON',$4)`,
      [actor.organizationId, p.id, !!input.treatmentConsent, actor.label], db);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "clinical.intake.record", targetType: "intake_submission", targetId: ins.id,
      changes: { patientId: p.id, episodeId, treatmentConsent: !!input.treatmentConsent }, correlationId });
    return { intakeId: ins.id, duplicate: false };
  });
}

// ─────────────────────────── Session notes ───────────────────────────

export interface NoteFields {
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  interventions?: string | null;
  patientResponse?: string | null;
}

function noteFields(f: NoteFields) {
  return {
    subjective: text(f.subjective, 4000, "Subjective", "subjective"),
    objective: text(f.objective, 4000, "Objective", "objective"),
    assessment: text(f.assessment, 4000, "Assessment", "assessment"),
    plan: text(f.plan, 4000, "Plan", "plan"),
    interventions: text(f.interventions, 2000, "Interventions", "interventions"),
    patientResponse: text(f.patientResponse, 2000, "Patient response", "patientResponse"),
  };
}

const NOTE_VISIT_STATUSES = ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"];

/** Create or update today's draft. Only the therapist assigned to the visit writes its note. */
export async function saveNoteDraft(actor: Actor, input: NoteFields & { appointmentId: string; expectedVersion?: number | null }, correlationId: string) {
  const f = noteFields(input);
  return tx(async (db) => {
    assertPermission(actor, "CLINICAL_NOTES_WRITE");
    if (!/^[0-9a-f-]{36}$/i.test(input.appointmentId)) throw new DomainError("NOT_FOUND", "Appointment not found.");
    const appt = await q1<{ id: string; patient_id: string; therapist_id: string | null; status: string; episode_id: string | null }>(
      `SELECT id, patient_id, therapist_id, status, episode_id FROM appointment WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
      [input.appointmentId, actor.organizationId], db);
    if (!appt) throw new DomainError("NOT_FOUND", "Appointment not found.");
    const { therapistId, actor: a } = await assertCareTeam(actor, appt.patient_id, "CLINICAL_NOTES_WRITE", db);
    if (appt.therapist_id !== therapistId) throw new DomainError("FORBIDDEN", "Only the physiotherapist assigned to this visit can write its session note.");
    if (!NOTE_VISIT_STATUSES.includes(appt.status)) throw new DomainError("INVALID_TRANSITION", "A session note can be written only for a confirmed, in-progress or completed visit.");
    if (!appt.episode_id) throw new DomainError("VALIDATION", "Choose or start the episode of care for this visit first.", { episodeId: "Required" });
    const existing = await q1<{ id: string; status: string; version: number; author_staff_id: string }>(
      `SELECT id, status, version, author_staff_id FROM clinical_note WHERE appointment_id=$1 FOR UPDATE`, [appt.id], db);
    if (!existing) {
      if (input.expectedVersion) throw new DomainError("STALE_VERSION", "This note changed since you opened it. Reload to see the latest version.");
      try {
        const n = (await q1<{ id: string; version: number }>(
          `INSERT INTO clinical_note (organization_id, patient_id, episode_id, appointment_id, author_staff_id, author_name,
             subjective, objective, assessment, plan, interventions, patient_response)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, version`,
          [a.organizationId, appt.patient_id, appt.episode_id, appt.id, a.staffId, a.displayName,
            f.subjective, f.objective, f.assessment, f.plan, f.interventions, f.patientResponse], db))!;
        await audit(db, { organizationId: a.organizationId, actor: a.label, action: "clinical.note.draft", targetType: "clinical_note", targetId: n.id, changes: { appointmentId: appt.id }, correlationId });
        return { noteId: n.id, version: n.version };
      } catch (e) {
        if (pgErrorCode(e) === "23505") throw new DomainError("STALE_VERSION", "A note for this visit was just started elsewhere. Reload to continue it.");
        throw e;
      }
    }
    if (existing.status === "SIGNED") throw new DomainError("INVALID_TRANSITION", "This note is signed. Add an addendum to correct or extend it.");
    if (existing.author_staff_id !== a.staffId) throw new DomainError("FORBIDDEN", "Only the author of this draft can change it.");
    if (input.expectedVersion != null && existing.version !== input.expectedVersion) {
      throw new DomainError("STALE_VERSION", "This note changed since you opened it (another tab or device). Reload to see the latest version.");
    }
    const n = (await q1<{ version: number }>(
      `UPDATE clinical_note SET subjective=$2, objective=$3, assessment=$4, plan=$5, interventions=$6, patient_response=$7,
              episode_id=$8, version=version+1, updated_at=now() WHERE id=$1 RETURNING version`,
      [existing.id, f.subjective, f.objective, f.assessment, f.plan, f.interventions, f.patientResponse, appt.episode_id], db))!;
    await audit(db, { organizationId: a.organizationId, actor: a.label, action: "clinical.note.draft", targetType: "clinical_note", targetId: existing.id, changes: { version: n.version }, correlationId });
    return { noteId: existing.id, version: n.version };
  });
}

/** Sign the note: it becomes the attributable record and is frozen. */
export async function signNote(actor: Actor, input: { noteId: string; expectedVersion: number }, correlationId: string) {
  return tx(async (db) => {
    assertPermission(actor, "CLINICAL_NOTES_WRITE");
    if (!/^[0-9a-f-]{36}$/i.test(input.noteId)) throw new DomainError("NOT_FOUND", "Note not found.");
    const n = await q1<{ id: string; patient_id: string; status: string; version: number; author_staff_id: string; s: boolean; o: boolean; a: boolean; p: boolean; visit_status: string }>(
      `SELECT n.id, n.patient_id, n.status, n.version, n.author_staff_id, n.subjective IS NOT NULL s, n.objective IS NOT NULL o, n.assessment IS NOT NULL a, n.plan IS NOT NULL p,
              a.status visit_status
         FROM clinical_note n JOIN appointment a ON a.id=n.appointment_id WHERE n.id=$1 AND n.organization_id=$2 FOR UPDATE OF n`, [input.noteId, actor.organizationId], db);
    if (!n) throw new DomainError("NOT_FOUND", "Note not found.");
    const { actor: a } = await assertCareTeam(actor, n.patient_id, "CLINICAL_NOTES_WRITE", db);
    if (n.status === "SIGNED") throw new DomainError("INVALID_TRANSITION", "This note is already signed.");
    if (n.author_staff_id !== a.staffId) throw new DomainError("FORBIDDEN", "Only the author can sign this note.");
    if (n.version !== input.expectedVersion) throw new DomainError("STALE_VERSION", "This note changed since you opened it. Reload, check it, then sign.");
    if (!(n.s || n.o) || !(n.a || n.p)) throw new DomainError("VALIDATION", "Before signing, record what the patient reported or what you found (S or O), and your assessment or plan (A or P).");
    // A draft can be prepared ahead of the visit, but the record is signed only once the patient has arrived.
    if (!["CHECKED_IN", "IN_PROGRESS", "COMPLETED"].includes(n.visit_status)) {
      throw new DomainError("INVALID_TRANSITION", "Check the patient in before signing. The draft is saved and can be signed once the visit has started.");
    }
    await q(`UPDATE clinical_note SET status='SIGNED', signed_at=now(), updated_at=now() WHERE id=$1`, [n.id], db);
    await audit(db, { organizationId: a.organizationId, actor: a.label, action: "clinical.note.sign", targetType: "clinical_note", targetId: n.id, correlationId });
  });
}

/** A dated, attributed addition to a signed note. The signed text itself never changes. */
export async function addAddendum(actor: Actor, input: { noteId: string; body: string }, correlationId: string) {
  const body = text(input.body, 4000, "Addendum", "body", { required: true, min: 3 })!;
  return tx(async (db) => {
    assertPermission(actor, "CLINICAL_NOTES_WRITE");
    if (!/^[0-9a-f-]{36}$/i.test(input.noteId)) throw new DomainError("NOT_FOUND", "Note not found.");
    const n = await q1<{ id: string; patient_id: string; status: string }>(
      `SELECT id, patient_id, status FROM clinical_note WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [input.noteId, actor.organizationId], db);
    if (!n) throw new DomainError("NOT_FOUND", "Note not found.");
    const { actor: a } = await assertCareTeam(actor, n.patient_id, "CLINICAL_NOTES_WRITE", db);
    if (n.status !== "SIGNED") throw new DomainError("INVALID_TRANSITION", "The draft can still be edited directly; addenda are for signed notes.");
    const ad = (await q1<{ id: string }>(
      `INSERT INTO clinical_note_addendum (note_id, author_staff_id, author_name, body) VALUES ($1,$2,$3,$4) RETURNING id`,
      [n.id, a.staffId, a.displayName, body], db))!;
    await audit(db, { organizationId: a.organizationId, actor: a.label, action: "clinical.note.addendum", targetType: "clinical_note", targetId: n.id, changes: { addendumId: ad.id }, correlationId });
    return { addendumId: ad.id };
  });
}

// ─────────────────────────── Plan and goals ───────────────────────────

export async function revisePlan(actor: Actor, input: { episodeId: string; frequency?: string | null; interventions?: string | null; nextReassessmentOn?: string | null }, correlationId: string) {
  const frequency = text(input.frequency, 200, "Frequency", "frequency");
  const interventions = text(input.interventions, 2000, "Interventions", "interventions");
  const next = date(input.nextReassessmentOn, "Next reassessment", "nextReassessmentOn");
  if (!frequency && !interventions && !next) throw new DomainError("VALIDATION", "Enter the frequency, interventions or next reassessment date.");
  return tx(async (db) => {
    const { ep, actor: a } = await episodeForWrite(db, actor, input.episodeId);
    if (next && next < ep.opened_on) throw new DomainError("VALIDATION", "The reassessment date is before the episode started.", { nextReassessmentOn: "Too early" });
    const r = (await q1<{ id: string }>(
      `INSERT INTO care_plan_revision (episode_id, frequency, interventions, next_reassessment_on, author_staff_id, author_name)
       VALUES ($1,$2,$3,$4::date,$5,$6) RETURNING id`, [ep.id, frequency, interventions, next, a.staffId, a.displayName], db))!;
    await audit(db, { organizationId: a.organizationId, actor: a.label, action: "clinical.plan.revise", targetType: "care_episode", targetId: ep.id, changes: { revisionId: r.id }, correlationId });
    return { revisionId: r.id };
  });
}

export async function addGoal(actor: Actor, input: { episodeId: string; description: string; baseline: string; targetOn?: string | null }, correlationId: string) {
  const description = text(input.description, 300, "Goal", "description", { required: true, min: 3 })!;
  const baseline = text(input.baseline, 500, "Baseline", "baseline", { required: true })!;
  const targetOn = date(input.targetOn, "Target date", "targetOn");
  return tx(async (db) => {
    const { ep, actor: a } = await episodeForWrite(db, actor, input.episodeId);
    const g = (await q1<{ id: string }>(
      `INSERT INTO care_goal (episode_id, description, baseline, target_on, author_staff_id, author_name) VALUES ($1,$2,$3,$4::date,$5,$6) RETURNING id`,
      [ep.id, description, baseline, targetOn, a.staffId, a.displayName], db))!;
    await audit(db, { organizationId: a.organizationId, actor: a.label, action: "clinical.goal.create", targetType: "care_goal", targetId: g.id, changes: { episodeId: ep.id }, correlationId });
    return { goalId: g.id };
  });
}

export async function recordGoalProgress(actor: Actor, input: { goalId: string; progress: string; status?: string | null; appointmentId?: string | null }, correlationId: string) {
  const progress = text(input.progress, 1000, "Progress", "progress", { required: true, min: 2 })!;
  const status = ((input.status ?? "ACTIVE").trim().toUpperCase() || "ACTIVE") as GoalStatus;
  if (!GOAL_STATUSES.some((g) => g.value === status)) throw new DomainError("VALIDATION", "Choose the goal status.", { status: "Invalid" });
  return tx(async (db) => {
    assertPermission(actor, "CLINICAL_NOTES_WRITE");
    if (!/^[0-9a-f-]{36}$/i.test(input.goalId)) throw new DomainError("NOT_FOUND", "Goal not found.");
    const g = await q1<{ id: string; episode_id: string; status: string }>(
      `SELECT g.id, g.episode_id, g.status FROM care_goal g JOIN care_episode e ON e.id=g.episode_id WHERE g.id=$1 AND e.organization_id=$2 FOR UPDATE OF g`,
      [input.goalId, actor.organizationId], db);
    if (!g) throw new DomainError("NOT_FOUND", "Goal not found.");
    const { ep, actor: a } = await episodeForWrite(db, actor, g.episode_id);
    if (g.status !== "ACTIVE") throw new DomainError("INVALID_TRANSITION", "This goal is closed. Add a new goal to keep working on it.");
    const visit = await checkVisit(db, a.organizationId, ep.patient_id, input.appointmentId);
    const recordedOn = (visit ? await appointmentLocalDate(db, visit) : null) ?? (await todayFor(db, a.organizationId));
    await q(
      `INSERT INTO care_goal_progress (goal_id, appointment_id, progress, status_after, author_staff_id, author_name, recorded_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7::date)`, [g.id, visit, progress, status, a.staffId, a.displayName, recordedOn], db);
    if (status !== g.status) await q(`UPDATE care_goal SET status=$2, updated_at=now() WHERE id=$1`, [g.id, status], db);
    await audit(db, { organizationId: a.organizationId, actor: a.label, action: "clinical.goal.progress", targetType: "care_goal", targetId: g.id, changes: { status }, correlationId });
  });
}

// ─────────────────────────── Measurements ───────────────────────────

export interface MeasurementInput {
  episodeId: string;
  appointmentId?: string | null;
  measuredOn?: string | null;
  kind: string;
  bodyRegion: string;
  side: string;
  movement: string;
  value: string | number;
  unit: string;
  observation?: string | null;
}

export function checkMeasurement(input: Omit<MeasurementInput, "episodeId">) {
  const kind = (input.kind ?? "").trim().toUpperCase();
  if (!MEASUREMENT_KINDS.some((k) => k.value === kind)) throw new DomainError("VALIDATION", "Choose what is being measured.", { kind: "Invalid" });
  const unit = (input.unit ?? "").trim().toUpperCase() as Unit;
  const spec = UNITS[unit];
  if (!spec) throw new DomainError("VALIDATION", "Choose the unit or scale.", { unit: "Invalid" });
  if (!(spec.kinds as readonly string[]).includes(kind)) throw new DomainError("VALIDATION", `${spec.label} is not a scale for this kind of measurement.`, { unit: "Wrong scale" });
  const raw = String(input.value ?? "").trim();
  const value = Number(raw);
  if (!raw || !Number.isFinite(value)) throw new DomainError("VALIDATION", "Enter the measured value as a number.", { value: "Invalid" });
  if (value < spec.min || value > spec.max) throw new DomainError("VALIDATION", `Enter a value between ${spec.min} and ${spec.max} for ${spec.label}.`, { value: "Out of range" });
  if (Math.abs(Math.round(value / spec.step) * spec.step - value) > 1e-9) throw new DomainError("VALIDATION", `${spec.label} is recorded in steps of ${spec.step}.`, { value: "Invalid step" });
  return {
    kind, unit, value: value.toFixed(2),
    bodyRegion: region(input.bodyRegion, true)!,
    side: side(input.side, true)!,
    movement: text(input.movement, 80, "Movement or test", "movement", { required: true, min: 2 })!,
    observation: text(input.observation, 500, "Observation", "observation"),
    measuredOn: date(input.measuredOn, "Measurement date", "measuredOn"),
  };
}

export async function addMeasurement(actor: Actor, input: MeasurementInput, correlationId: string) {
  const m = checkMeasurement(input);
  return tx(async (db) => {
    const { ep, actor: a } = await episodeForWrite(db, actor, input.episodeId);
    const visit = await checkVisit(db, a.organizationId, ep.patient_id, input.appointmentId);
    const measuredOn = m.measuredOn ?? (visit ? await appointmentLocalDate(db, visit) : null) ?? (await todayFor(db, a.organizationId));
    if (measuredOn < ep.opened_on) throw new DomainError("VALIDATION", "The measurement date is before the episode started.", { measuredOn: "Too early" });
    if (measuredOn > (await todayFor(db, a.organizationId))) throw new DomainError("VALIDATION", "A measurement cannot be dated in the future.", { measuredOn: "Future" });
    const r = (await q1<{ id: string }>(
      `INSERT INTO assessment_measurement (episode_id, appointment_id, measured_on, kind, body_region, side, movement, value, unit, observation, author_staff_id, author_name)
       VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [ep.id, visit, measuredOn, m.kind, m.bodyRegion, m.side, m.movement, m.value, m.unit, m.observation, a.staffId, a.displayName], db))!;
    await audit(db, { organizationId: a.organizationId, actor: a.label, action: "clinical.measurement.add", targetType: "assessment_measurement", targetId: r.id, changes: { episodeId: ep.id }, correlationId });
    return { measurementId: r.id };
  });
}

/** Strike a measurement as entered in error. It stays visible, crossed out, with who and why. */
export async function voidMeasurement(actor: Actor, input: { measurementId: string; reason: string }, correlationId: string) {
  const reason = text(input.reason, 300, "Reason", "reason", { required: true, min: 3 })!;
  return tx(async (db) => {
    assertPermission(actor, "CLINICAL_NOTES_WRITE");
    if (!/^[0-9a-f-]{36}$/i.test(input.measurementId)) throw new DomainError("NOT_FOUND", "Measurement not found.");
    const m = await q1<{ id: string; episode_id: string; author_staff_id: string; voided_at: Date | null }>(
      `SELECT m.id, m.episode_id, m.author_staff_id, m.voided_at FROM assessment_measurement m JOIN care_episode e ON e.id=m.episode_id
        WHERE m.id=$1 AND e.organization_id=$2 FOR UPDATE OF m`, [input.measurementId, actor.organizationId], db);
    if (!m) throw new DomainError("NOT_FOUND", "Measurement not found.");
    const { actor: a } = await episodeForWrite(db, actor, m.episode_id, false);
    if (m.voided_at) throw new DomainError("INVALID_TRANSITION", "This measurement is already marked as entered in error.");
    if (m.author_staff_id !== a.staffId) throw new DomainError("FORBIDDEN", "Only the person who recorded this measurement can mark it as entered in error.");
    await q(`UPDATE assessment_measurement SET voided_at=now(), voided_by=$2, void_reason=$3 WHERE id=$1`, [m.id, `${a.displayName} (${a.label})`, reason], db);
    await audit(db, { organizationId: a.organizationId, actor: a.label, action: "clinical.measurement.void", targetType: "assessment_measurement", targetId: m.id, correlationId });
  });
}

// ─────────────────────────── Clinical lead review ───────────────────────────

/**
 * The clinical lead countersigns a colleague's signed note ("reviewed by").
 * The note text and its author never change; corrections go in an addendum.
 */
export async function reviewNote(actor: Actor, input: { noteId: string; comment?: string | null }, correlationId: string) {
  const comment = text(input.comment, 1000, "Review comment", "comment");
  return tx(async (db) => {
    assertPermission(actor, "CLINICAL_RECORDS_ALL");
    if (!/^[0-9a-f-]{36}$/i.test(input.noteId)) throw new DomainError("NOT_FOUND", "Note not found.");
    const n = await q1<{ id: string; patient_id: string; status: string; author_staff_id: string }>(
      `SELECT id, patient_id, status, author_staff_id FROM clinical_note WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [input.noteId, actor.organizationId], db);
    if (!n) throw new DomainError("NOT_FOUND", "Note not found.");
    const { actor: a } = await assertCareTeam(actor, n.patient_id, "CLINICAL_NOTES_READ", db);
    if (n.status !== "SIGNED") throw new DomainError("INVALID_TRANSITION", "Only a signed note can be countersigned.");
    if (n.author_staff_id === a.staffId) throw new DomainError("VALIDATION", "You wrote this note, so you can't countersign it.");
    try {
      const r = (await q1<{ id: string }>(
        `INSERT INTO clinical_note_review (note_id, reviewer_staff_id, reviewer_name, comment) VALUES ($1,$2,$3,$4) RETURNING id`,
        [n.id, a.staffId, a.displayName, comment], db))!;
      await audit(db, { organizationId: a.organizationId, actor: a.label, action: "clinical.note.review", targetType: "clinical_note", targetId: n.id, changes: { reviewId: r.id }, correlationId });
      return { reviewId: r.id };
    } catch (e) {
      if (pgErrorCode(e) === "23505") throw new DomainError("DUPLICATE", "You have already countersigned this note.");
      throw e;
    }
  });
}
