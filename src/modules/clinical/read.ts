import "server-only";
import { getPool, q, q1 } from "@/lib/db";
import { audit } from "@/modules/audit";
import { DomainError } from "@/lib/errors";
import type { StaffActor } from "@/modules/auth/actor";
import { assertCareTeam, therapistIdFor } from "./access";
import { buildSeries, type MeasurementRow } from "./series";

/* Read models for the clinical screens. Each call re-checks care-team access. */

export interface EpisodeSummary {
  id: string; title: string; body_region: string | null; side: string | null; status: string; opened_on: string; closed_on: string | null;
  working_diagnosis: string | null; referrer: string | null; lead: string | null; visits: number; signed_notes: number; next_reassessment_on: string | null;
}

const EPISODE_SUMMARY_SQL = `
  SELECT e.id, e.title, e.body_region, e.side, e.status, to_char(e.opened_on,'YYYY-MM-DD') opened_on, to_char(e.closed_on,'YYYY-MM-DD') closed_on,
         e.working_diagnosis, e.referrer, t.display_name lead,
         (SELECT count(*)::int FROM appointment a WHERE a.episode_id=e.id) visits,
         (SELECT count(*)::int FROM clinical_note n WHERE n.episode_id=e.id AND n.status='SIGNED') signed_notes,
         (SELECT to_char(r.next_reassessment_on,'YYYY-MM-DD') FROM care_plan_revision r WHERE r.episode_id=e.id ORDER BY r.created_at DESC LIMIT 1) next_reassessment_on
    FROM care_episode e LEFT JOIN therapist t ON t.id=e.lead_therapist_id`;

/** Who opened which clinical record and when (feature #10). No clinical content is logged. */
async function logView(actor: StaffActor, action: string, patientId: string, detail: Record<string, unknown> = {}) {
  await audit(getPool(), { organizationId: actor.organizationId, actor: actor.label, action, targetType: "patient", targetId: patientId,
    changes: { ...detail, wideAccess: actor.permissions.has("CLINICAL_RECORDS_ALL") } });
}

export async function getChart(actor: StaffActor, patientId: string) {
  const { patient } = await assertCareTeam(actor, patientId, "CLINICAL_NOTES_READ");
  await logView(actor, "clinical.chart.view", patient.id);
  const [legacy, episodes, intakes, visits] = await Promise.all([
    q1<{ diagnosis: string | null; treatment_protocol: string | null; age: number | null; sex: string | null }>(
      `SELECT diagnosis, treatment_protocol, CASE WHEN age_years IS NULL THEN NULL ELSE age_years + EXTRACT(YEAR FROM age(current_date, COALESCE(age_recorded_on, current_date)))::int END age, sex
         FROM patient WHERE id=$1`, [patient.id]),
    q<EpisodeSummary>(`${EPISODE_SUMMARY_SQL} WHERE e.patient_id=$1 ORDER BY (e.status='OPEN') DESC, e.opened_on DESC`, [patient.id]),
    q<{ id: string; created_at: Date; main_concern: string; relevant_history: string | null; patient_goal: string | null; referrer: string | null;
        preferred_language: string | null; treatment_consent: boolean; channel: string; episode_title: string | null }>(
      `SELECT i.id, i.created_at, i.main_concern, i.relevant_history, i.patient_goal, i.referrer, i.preferred_language, i.treatment_consent, i.channel, e.title episode_title
         FROM intake_submission i LEFT JOIN care_episode e ON e.id=i.episode_id WHERE i.patient_id=$1 ORDER BY i.created_at DESC`, [patient.id]),
    q<{ id: string; starts_at: Date; status: string; service: string; therapist: string | null; episode_id: string | null; timezone: string }>(
      `SELECT a.id, a.starts_at, a.status, s.name service, t.display_name therapist, a.episode_id, b.timezone
         FROM appointment a JOIN service s ON s.id=a.service_id JOIN branch b ON b.id=a.branch_id LEFT JOIN therapist t ON t.id=a.therapist_id
        WHERE a.patient_id=$1 AND a.status NOT IN ('REJECTED') ORDER BY a.starts_at DESC LIMIT 40`, [patient.id]),
  ]);
  return { patient, legacy: legacy!, episodes, intakes, visits };
}

export interface NoteView {
  id: string; appointment_id: string; status: string; version: number; author_name: string; author_staff_id: string;
  subjective: string | null; objective: string | null; assessment: string | null; plan: string | null; interventions: string | null; patient_response: string | null;
  signed_at: Date | null; created_at: Date; updated_at: Date; visit_at: Date; service: string; timezone: string;
  addenda: { id: string; author_name: string; body: string; created_at: Date }[];
  reviews: { id: string; reviewer_name: string; reviewer_staff_id: string; comment: string | null; created_at: Date }[];
}

async function notesWithAddenda(where: string, params: unknown[]): Promise<NoteView[]> {
  const notes = await q<Omit<NoteView, "addenda" | "reviews">>(
    `SELECT n.id, n.appointment_id, n.status, n.version, n.author_name, n.author_staff_id, n.subjective, n.objective, n.assessment, n.plan,
            n.interventions, n.patient_response, n.signed_at, n.created_at, n.updated_at, a.starts_at visit_at, s.name service, b.timezone
       FROM clinical_note n JOIN appointment a ON a.id=n.appointment_id JOIN service s ON s.id=a.service_id JOIN branch b ON b.id=a.branch_id
      WHERE ${where} ORDER BY a.starts_at DESC`, params);
  if (!notes.length) return [];
  const add = await q<{ id: string; note_id: string; author_name: string; body: string; created_at: Date }>(
    `SELECT id, note_id, author_name, body, created_at FROM clinical_note_addendum WHERE note_id = ANY($1::uuid[]) ORDER BY created_at`, [notes.map((n) => n.id)]);
  const rev = await q<NoteView["reviews"][number] & { note_id: string }>(
    `SELECT id, note_id, reviewer_name, reviewer_staff_id, comment, created_at FROM clinical_note_review WHERE note_id = ANY($1::uuid[]) ORDER BY created_at`, [notes.map((n) => n.id)]);
  return notes.map((n) => ({ ...n, addenda: add.filter((x) => x.note_id === n.id), reviews: rev.filter((x) => x.note_id === n.id) }));
}

export interface GoalView {
  id: string; description: string; baseline: string; target_on: string | null; status: string; author_name: string; created_at: Date;
  progress: { id: string; progress: string; status_after: string; author_name: string; recorded_on: string; appointment_id: string | null }[];
}

async function goalsFor(episodeId: string): Promise<GoalView[]> {
  const goals = await q<Omit<GoalView, "progress">>(
    `SELECT id, description, baseline, to_char(target_on,'YYYY-MM-DD') target_on, status, author_name, created_at FROM care_goal WHERE episode_id=$1 ORDER BY (status='ACTIVE') DESC, created_at`, [episodeId]);
  if (!goals.length) return [];
  const prog = await q<GoalView["progress"][number] & { goal_id: string }>(
    `SELECT id, goal_id, progress, status_after, author_name, to_char(recorded_on,'YYYY-MM-DD') recorded_on, appointment_id
       FROM care_goal_progress WHERE goal_id = ANY($1::uuid[]) ORDER BY created_at`, [goals.map((g) => g.id)]);
  return goals.map((g) => ({ ...g, progress: prog.filter((p) => p.goal_id === g.id) }));
}

async function planFor(episodeId: string) {
  return q<{ id: string; frequency: string | null; interventions: string | null; next_reassessment_on: string | null; author_name: string; created_at: Date }>(
    `SELECT id, frequency, interventions, to_char(next_reassessment_on,'YYYY-MM-DD') next_reassessment_on, author_name, created_at
       FROM care_plan_revision WHERE episode_id=$1 ORDER BY created_at DESC`, [episodeId]);
}

async function measurementsFor(episodeId: string) {
  return q<MeasurementRow>(
    `SELECT id, to_char(measured_on,'YYYY-MM-DD') measured_on, kind, body_region, side, movement, value::text, unit, observation, author_name, appointment_id,
            voided_at, voided_by, void_reason, created_at FROM assessment_measurement WHERE episode_id=$1`, [episodeId]);
}

export async function getEpisode(actor: StaffActor, episodeId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(episodeId)) throw new DomainError("NOT_FOUND", "Episode not found.");
  const e = await q1<{ patient_id: string }>(`SELECT patient_id FROM care_episode WHERE id=$1 AND organization_id=$2`, [episodeId, actor.organizationId]);
  if (!e) throw new DomainError("NOT_FOUND", "Episode not found.");
  const { patient, therapistId } = await assertCareTeam(actor, e.patient_id, "CLINICAL_NOTES_READ");
  await logView(actor, "clinical.episode.view", patient.id, { episodeId });
  const [episode, plan, goals, measurements, notes, visits] = await Promise.all([
    q1<EpisodeSummary & { discharge_summary: string | null; legacy_summary: string | null; legacy_reviewed_by: string | null }>(
      `${EPISODE_SUMMARY_SQL.replace("SELECT e.id,", "SELECT e.discharge_summary, e.legacy_summary, e.legacy_reviewed_by, e.id,")} WHERE e.id=$1`, [episodeId]),
    planFor(episodeId),
    goalsFor(episodeId),
    measurementsFor(episodeId),
    notesWithAddenda("n.episode_id=$1", [episodeId]),
    q<{ id: string; starts_at: Date; status: string; service: string; therapist: string | null; timezone: string }>(
      `SELECT a.id, a.starts_at, a.status, s.name service, t.display_name therapist, b.timezone FROM appointment a JOIN service s ON s.id=a.service_id
         JOIN branch b ON b.id=a.branch_id LEFT JOIN therapist t ON t.id=a.therapist_id WHERE a.episode_id=$1 ORDER BY a.starts_at`, [episodeId]),
  ]);
  return {
    patient, episode: episode!, plan, goals, series: buildSeries(measurements), notes, visits,
    canWrite: actor.permissions.has("CLINICAL_NOTES_WRITE") && !!therapistId,
    canReview: actor.permissions.has("CLINICAL_RECORDS_ALL"),
    myStaffId: actor.staffId,
    attendance: {
      completed: visits.filter((v) => v.status === "COMPLETED").length,
      missed: visits.filter((v) => v.status === "NO_SHOW").length,
      cancelled: visits.filter((v) => v.status === "CANCELLED").length,
    },
  };
}

/**
 * The Treatment section on an appointment: the previous signed note next to
 * today's draft, current goals and plan, recent measurements. Returns null —
 * never throws — when this staff member is not on the patient's care team, so
 * the rest of the appointment page still renders for reception.
 */
export async function getTreatmentPanel(actor: StaffActor, appointmentId: string) {
  if (!actor.permissions.has("CLINICAL_NOTES_READ")) return null;
  const therapistId = await therapistIdFor(actor);
  if (!therapistId) return null;
  const appt = await q1<{ id: string; patient_id: string; therapist_id: string | null; status: string; episode_id: string | null; starts_at: Date }>(
    `SELECT id, patient_id, therapist_id, status, episode_id, starts_at FROM appointment WHERE id=$1 AND organization_id=$2`, [appointmentId, actor.organizationId]);
  if (!appt) return null;
  try { await assertCareTeam(actor, appt.patient_id, "CLINICAL_NOTES_READ"); } catch { return null; }
  await logView(actor, "clinical.visit.view", appt.patient_id, { appointmentId: appt.id });

  const openEpisodes = await q<EpisodeSummary>(`${EPISODE_SUMMARY_SQL} WHERE e.patient_id=$1 AND (e.status='OPEN' OR e.id=$2) ORDER BY e.opened_on DESC`,
    [appt.patient_id, appt.episode_id]);
  const legacy = await q1<{ diagnosis: string | null; treatment_protocol: string | null }>(`SELECT diagnosis, treatment_protocol FROM patient WHERE id=$1`, [appt.patient_id]);
  const [today] = await notesWithAddenda("n.appointment_id=$1", [appt.id]);
  // Previous signed note: same episode if the visit is filed, else any of the patient's.
  const [previous] = await notesWithAddenda(
    `n.status='SIGNED' AND n.appointment_id <> $1 AND a.starts_at <= $2 AND ${appt.episode_id ? "n.episode_id=$3" : "n.patient_id=$3"}`,
    [appt.id, appt.starts_at, appt.episode_id ?? appt.patient_id]);
  const episodeId = appt.episode_id;
  const [plan, goals, measurements] = episodeId
    ? await Promise.all([planFor(episodeId), goalsFor(episodeId), measurementsFor(episodeId)])
    : [[], [], []];
  const visitNumber = episodeId
    ? (await q1<{ n: number }>(`SELECT count(*)::int n FROM appointment WHERE episode_id=$1 AND starts_at <= $2 AND status NOT IN ('CANCELLED','REJECTED','NO_SHOW')`, [episodeId, appt.starts_at]))!.n
    : null;
  const isAssigned = appt.therapist_id === therapistId;
  return {
    appointment: appt,
    episodes: openEpisodes,
    episode: openEpisodes.find((e) => e.id === episodeId) ?? null,
    legacy: legacy?.diagnosis || legacy?.treatment_protocol ? legacy : null,
    today: today ?? null,
    previous: previous ?? null,
    plan: plan[0] ?? null,
    goals,
    series: buildSeries(measurements),
    visitNumber,
    canWrite: isAssigned && actor.permissions.has("CLINICAL_NOTES_WRITE"),
    canFile: actor.permissions.has("CLINICAL_NOTES_WRITE"),
    canReview: actor.permissions.has("CLINICAL_RECORDS_ALL"),
    isAssigned,
    myStaffId: actor.staffId,
  };
}
