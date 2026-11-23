import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getPool, q, q1 } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { permissionsFor, type Role } from "@/modules/auth/permissions";
import type { StaffActor } from "@/modules/auth/actor";
import { createPatient, updatePatient } from "@/modules/patients/admin";
import { createStaffBooking } from "@/modules/scheduling/staff-booking";
import { transitionAppointment } from "@/modules/scheduling/appointments";
import {
  addAddendum, addGoal, addMeasurement, createEpisode, dischargeEpisode, linkAppointmentToEpisode, recordGoalProgress, recordIntake,
  revisePlan, saveNoteDraft, signNote, voidMeasurement,
} from "@/modules/clinical/records";
import { getChart, getEpisode, getTreatmentPanel } from "@/modules/clinical/read";
import { canOpenChart } from "@/modules/clinical/access";
import { buildFixture, futureSlot, resetDatabase, type Fixture } from "./helpers";

/*
 * Delivery step 1 — clinical record. Acceptance checks from the brief:
 *  #2 episodes and intake, #3 assessments, #4 goals / notes / addenda, #10 access split.
 */

let f: Fixture;
let asha: StaffActor;      // physio, linked to therapist1 — treats the patient
let ravi: StaffActor;      // physio, linked to therapist2 — not on this patient's care team at first
let frontDesk: StaffActor; // reception: contact and booking only
let patientId: string;
const visits: string[] = [];
let kneeEp: string;
let shoulderEp: string;

async function expectCode(p: Promise<unknown>, code: string) {
  try { await p; } catch (e) {
    if (e instanceof DomainError) { expect(e.code).toBe(code); return; }
    throw e;
  }
  throw new Error(`expected DomainError ${code}, but the call succeeded`);
}
async function expectDbRefusal(sql: string, params: unknown[]) {
  await expect(getPool().query(sql, params)).rejects.toThrow();
}

async function staff(name: string, roles: Role[], therapistId?: string): Promise<StaffActor> {
  const db = getPool();
  const s = (await db.query(`INSERT INTO staff_member (organization_id, auth_user_id, display_name) VALUES ($1,$2,$3) RETURNING id`, [f.orgId, randomUUID(), name])).rows[0];
  for (const r of roles) await db.query(`INSERT INTO role_grant (organization_id, staff_member_id, role) VALUES ($1,$2,$3)`, [f.orgId, s.id, r]);
  if (therapistId) await db.query(`UPDATE therapist SET staff_member_id=$2 WHERE id=$1`, [therapistId, s.id]);
  return { kind: "staff", staffId: s.id, organizationId: f.orgId, displayName: name, authUserId: "x", roles, permissions: permissionsFor(roles), label: `staff:${s.id}` };
}
const daysAgo = async (n: number) => (await q1<{ d: string }>(`SELECT to_char((now() AT TIME ZONE 'Asia/Kolkata')::date - $1::int,'YYYY-MM-DD') d`, [n]))!.d;
const checkIn = async (appointmentId: string) => {
  const v = (await q1<{ version: number }>(`SELECT version FROM appointment WHERE id=$1`, [appointmentId]))!.version;
  await transitionAppointment(f.receptionist, { appointmentId, expectedVersion: v, transition: "check_in" }, "t");
};
const version = async (noteId: string) => (await q1<{ version: number }>(`SELECT version FROM clinical_note WHERE id=$1`, [noteId]))!.version;

beforeAll(async () => {
  await resetDatabase();
  f = await buildFixture();
  asha = await staff("Asha (physio)", ["PHYSIOTHERAPIST"], f.therapist1);
  ravi = await staff("Ravi (physio)", ["PHYSIOTHERAPIST"], f.therapist2);
  frontDesk = f.receptionist;
  patientId = (await createPatient(frontDesk, { fullName: "Meena K", phone: "98860 10001" }, "t")).patientId;
  for (let i = 0; i < 4; i++) {
    const start = await futureSlot(f, f.branchA, f.therapist1, 1 + i * 2, 0);
    visits.push((await createStaffBooking(frontDesk, { patientId, serviceId: f.sessionSvc, therapistId: f.therapist1, startsAt: start, source: "PHONE" }, "t")).appointmentId);
  }
});
afterAll(async () => { await getPool().end(); });

describe("#10 contact and clinical access are separate", () => {
  it("reception and clinic ownership cannot open the chart; a physio not on the care team cannot either", async () => {
    await expectCode(getChart(frontDesk, patientId), "FORBIDDEN");
    await expectCode(getChart(f.owner, patientId), "FORBIDDEN");
    await expectCode(getChart(ravi, patientId), "FORBIDDEN");
    await expectCode(getChart(f.physio, patientId), "FORBIDDEN"); // physio role, but no therapist profile linked
    expect(await canOpenChart(asha, patientId)).toBe(true);
    expect(await canOpenChart(f.owner, patientId)).toBe(false);
    expect(await getTreatmentPanel(frontDesk, visits[0])).toBeNull();
    expect((await getChart(asha, patientId)).patient.id).toBe(patientId);
  });

  it("diagnosis and protocol need the clinical permission; reception edits leave them untouched", async () => {
    await expectCode(createPatient(frontDesk, { fullName: "Ravi T", phone: "98860 10002", diagnosis: "Frozen shoulder" }, "t"), "FORBIDDEN");
    const both = await staff("Dr Lead", ["RECEPTIONIST", "PHYSIOTHERAPIST"], undefined);
    await updatePatient(both, { patientId, fullName: "Meena K", phone: "98860 10001", diagnosis: "Right knee OA (old note)", treatmentProtocol: "IFT, quads" }, "t");
    await expectCode(updatePatient(frontDesk, { patientId, fullName: "Meena K", phone: "98860 10001", diagnosis: "" }, "t"), "FORBIDDEN");
    await updatePatient(frontDesk, { patientId, fullName: "Meena Kumar", phone: "98860 10001", address: "HSR Layout" }, "t");
    const p = await q1(`SELECT full_name, diagnosis, treatment_protocol FROM patient WHERE id=$1`, [patientId]);
    expect(p).toEqual({ full_name: "Meena Kumar", diagnosis: "Right knee OA (old note)", treatment_protocol: "IFT, quads" });
  });
});

describe("#2 episodes of care and intake", () => {
  it("reception completes intake; a double submit stores one; reception cannot read it back", async () => {
    const key = randomUUID();
    const input = { patientId, submissionKey: key, mainConcern: "Knee pain on stairs", relevantHistory: "Fell in 2024", patientGoal: "Climb stairs at home", treatmentConsent: true };
    const [a, b] = await Promise.all([recordIntake(frontDesk, input, "t"), recordIntake(frontDesk, input, "t")]);
    expect(a.intakeId).toBe(b.intakeId);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect((await q1<{ n: number }>(`SELECT count(*)::int n FROM intake_submission WHERE patient_id=$1`, [patientId]))!.n).toBe(1);
    expect((await q1<{ n: number }>(`SELECT count(*)::int n FROM consent_record WHERE patient_id=$1 AND purpose='TREATMENT' AND granted`, [patientId]))!.n).toBe(1);
    const other = (await createPatient(frontDesk, { fullName: "Someone", phone: "98860 10003" }, "t")).patientId;
    await expectCode(recordIntake(frontDesk, { ...input, patientId: other }, "t"), "IDEMPOTENCY_CONFLICT");
    expect((await getChart(asha, patientId)).intakes[0].main_concern).toBe("Knee pain on stairs");
  });

  it("the treating physio starts a knee episode from the visit and attaches the reviewed legacy text", async () => {
    kneeEp = (await createEpisode(asha, { patientId, title: "Right knee rehab", bodyRegion: "Knee", side: "RIGHT", workingDiagnosis: "Knee OA",
      appointmentId: visits[0], attachLegacy: true, openedOn: await daysAgo(30) }, "t")).episodeId;
    const e = await q1<{ legacy_summary: string; episode_ok: boolean }>(
      `SELECT e.legacy_summary, (SELECT episode_id FROM appointment WHERE id=$2)=e.id episode_ok FROM care_episode e WHERE e.id=$1`, [kneeEp, visits[0]]);
    expect(e!.episode_ok).toBe(true);
    expect(e!.legacy_summary).toContain("Right knee OA (old note)");
  });

  it("a returning knee patient starts a shoulder episode under the same OP number; histories stay separate", async () => {
    shoulderEp = (await createEpisode(asha, { patientId, title: "Left shoulder pain", bodyRegion: "Shoulder", side: "LEFT", openedOn: await daysAgo(5) }, "t")).episodeId;
    await linkAppointmentToEpisode(asha, { appointmentId: visits[3], episodeId: shoulderEp }, "t");
    const chart = await getChart(asha, patientId);
    expect(chart.episodes.map((x) => x.title).sort()).toEqual(["Left shoulder pain", "Right knee rehab"]);
    expect(new Set((await q<{ patient_id: string }>(`SELECT patient_id FROM care_episode WHERE id = ANY($1::uuid[])`, [[kneeEp, shoulderEp]])).map((r) => r.patient_id))).toEqual(new Set([patientId]));
    const shoulder = await getEpisode(asha, shoulderEp);
    expect(shoulder.visits.map((v) => v.id)).toEqual([visits[3]]);
    expect((await getEpisode(asha, kneeEp)).visits.map((v) => v.id)).not.toContain(visits[3]);
  });

  it("a visit can never be filed under another patient's episode", async () => {
    const other = (await createPatient(frontDesk, { fullName: "Other P", phone: "98860 10004" }, "t")).patientId;
    const start = await futureSlot(f, f.branchA, f.therapist1, 15, 0);
    const otherVisit = (await createStaffBooking(frontDesk, { patientId: other, serviceId: f.sessionSvc, therapistId: f.therapist1, startsAt: start, source: "PHONE" }, "t")).appointmentId;
    await expectCode(linkAppointmentToEpisode(asha, { appointmentId: otherVisit, episodeId: kneeEp }, "t"), "NOT_FOUND");
    await expectDbRefusal(`UPDATE appointment SET episode_id=$2 WHERE id=$1`, [otherVisit, kneeEp]);
  });
});

describe("#3 structured assessment", () => {
  it("compares left-knee flexion across visits; right knee and other scales stay separate", async () => {
    const ep = (await createEpisode(asha, { patientId, title: "Bilateral knee assessment", bodyRegion: "Knee", side: "BILATERAL", openedOn: await daysAgo(20) }, "t")).episodeId;
    const m = (side: string, value: number, unit: string, on: string, kind = "ROM") =>
      addMeasurement(asha, { episodeId: ep, kind, bodyRegion: "Knee", side, movement: "Flexion", value, unit, measuredOn: on }, "t");
    await m("LEFT", 85, "DEGREES", await daysAgo(14));
    await m("LEFT", 95, "DEGREES", await daysAgo(7));
    await m("LEFT", 105, "DEGREES", await daysAgo(0));
    await m("RIGHT", 120, "DEGREES", await daysAgo(14));
    await m("LEFT", 4, "MMT_0_5", await daysAgo(7), "STRENGTH");
    const series = (await getEpisode(asha, ep)).series;
    const left = series.find((s) => s.side === "LEFT" && s.unit === "DEGREES")!;
    expect([left.baseline!.value, left.latest!.value, left.change]).toEqual(["85.00", "105.00", 20]);
    const right = series.find((s) => s.side === "RIGHT")!;
    expect(right.points).toHaveLength(1);
    expect(right.latest).toBeNull(); // missing follow-up shows as missing, not as a change
    expect(series.find((s) => s.unit === "MMT_0_5")!.points).toHaveLength(1);
    expect(series).toHaveLength(3);
  });

  it("refuses wrong scales and impossible values; a struck-out entry stays visible but leaves the comparison", async () => {
    await expectCode(addMeasurement(asha, { episodeId: kneeEp, kind: "PAIN", bodyRegion: "Knee", side: "RIGHT", movement: "Stairs", value: 11, unit: "NPRS_0_10" }, "t"), "VALIDATION");
    await expectCode(addMeasurement(asha, { episodeId: kneeEp, kind: "PAIN", bodyRegion: "Knee", side: "RIGHT", movement: "Stairs", value: 40, unit: "DEGREES" }, "t"), "VALIDATION");
    await expectCode(addMeasurement(asha, { episodeId: kneeEp, kind: "ROM", bodyRegion: "Knees", side: "RIGHT", movement: "Flexion", value: 40, unit: "DEGREES" }, "t"), "VALIDATION");
    const a = await addMeasurement(asha, { episodeId: kneeEp, kind: "PAIN", bodyRegion: "Knee", side: "RIGHT", movement: "Stairs", value: 7, unit: "NPRS_0_10", measuredOn: await daysAgo(10) }, "t");
    const b = await addMeasurement(asha, { episodeId: kneeEp, kind: "PAIN", bodyRegion: "Knee", side: "RIGHT", movement: "Stairs", value: 2, unit: "NPRS_0_10", measuredOn: await daysAgo(3) }, "t");
    await expectCode(voidMeasurement(ravi, { measurementId: b.measurementId, reason: "Typo" }, "t"), "FORBIDDEN");
    await voidMeasurement(asha, { measurementId: b.measurementId, reason: "Typed 2 for 5" }, "t");
    await expectDbRefusal(`UPDATE assessment_measurement SET value=5 WHERE id=$1`, [a.measurementId]);
    await expectDbRefusal(`DELETE FROM assessment_measurement WHERE id=$1`, [a.measurementId]);
    const s = (await getEpisode(asha, kneeEp)).series.find((x) => x.movement === "Stairs")!;
    expect(s.points.map((p) => p.value)).toEqual(["7.00"]);
    expect(s.voided[0].void_reason).toBe("Typed 2 for 5");
  });
});

describe("#4 goals, plan and signed session notes", () => {
  let goalId: string;
  let note1: string;

  it("sets a functional goal with a baseline and a plan with the next reassessment", async () => {
    goalId = (await addGoal(asha, { episodeId: kneeEp, description: "Climb one flight of stairs independently", baseline: "Needs rail, one step at a time, 3 rests" }, "t")).goalId;
    await revisePlan(asha, { episodeId: kneeEp, frequency: "3 × week for 4 weeks", interventions: "Quads strengthening, step-ups", nextReassessmentOn: await daysAgo(-14) }, "t");
    await revisePlan(asha, { episodeId: kneeEp, frequency: "2 × week", nextReassessmentOn: await daysAgo(-21) }, "t");
    const e = await getEpisode(asha, kneeEp);
    expect(e.plan).toHaveLength(2);
    expect(e.plan[0].frequency).toBe("2 × week");
    expect(e.episode.next_reassessment_on).toBe(await daysAgo(-21));
  });

  it("only the assigned physio writes the visit note; it must say something before it is signed", async () => {
    await expectCode(saveNoteDraft(ravi, { appointmentId: visits[0], subjective: "x" }, "t"), "FORBIDDEN");
    await expectCode(saveNoteDraft(frontDesk, { appointmentId: visits[0], subjective: "x" }, "t"), "FORBIDDEN");
    const d = await saveNoteDraft(asha, { appointmentId: visits[0], subjective: "Pain 7/10 on stairs" }, "t");
    note1 = d.noteId;
    await expectCode(signNote(asha, { noteId: note1, expectedVersion: d.version }, "t"), "VALIDATION");
    const d2 = await saveNoteDraft(asha, { appointmentId: visits[0], expectedVersion: d.version, subjective: "Pain 7/10 on stairs", assessment: "Quads weakness", plan: "Start step-ups" }, "t");
    await expectCode(saveNoteDraft(asha, { appointmentId: visits[0], expectedVersion: d.version, subjective: "stale tab" }, "t"), "STALE_VERSION");
    await expectCode(signNote(asha, { noteId: note1, expectedVersion: d2.version }, "t"), "INVALID_TRANSITION"); // patient not here yet
    await checkIn(visits[0]);
    await signNote(asha, { noteId: note1, expectedVersion: d2.version }, "t");
  });

  it("a visit not filed under an episode cannot have a note yet", async () => {
    await expectCode(saveNoteDraft(asha, { appointmentId: visits[1], subjective: "x" }, "t"), "VALIDATION");
    await linkAppointmentToEpisode(asha, { appointmentId: visits[1], episodeId: kneeEp }, "t");
    await linkAppointmentToEpisode(asha, { appointmentId: visits[2], episodeId: kneeEp }, "t");
  });

  it("at visit four the physio sees the previous signed note, updates goal progress and signs", async () => {
    // Visit 2 signed, visit 3 left as a draft: the panel shows the latest SIGNED note.
    await checkIn(visits[1]);
    const v2 = await saveNoteDraft(asha, { appointmentId: visits[1], subjective: "Better", assessment: "Improving", plan: "Progress load" }, "t");
    await signNote(asha, { noteId: v2.noteId, expectedVersion: v2.version }, "t");
    await saveNoteDraft(asha, { appointmentId: visits[2], subjective: "draft only" }, "t");
    // Visit four of this episode is filed now (visits[3] belongs to the shoulder; use a new knee visit).
    const start = await futureSlot(f, f.branchA, f.therapist1, 9, 0);
    const v4 = (await createStaffBooking(frontDesk, { patientId, serviceId: f.sessionSvc, therapistId: f.therapist1, startsAt: start, source: "PHONE" }, "t")).appointmentId;
    await linkAppointmentToEpisode(asha, { appointmentId: v4, episodeId: kneeEp }, "t");
    const panel = (await getTreatmentPanel(asha, v4))!;
    expect(panel.previous!.id).toBe(v2.noteId);
    expect(panel.previous!.status).toBe("SIGNED");
    expect(panel.goals[0].description).toBe("Climb one flight of stairs independently");
    expect(panel.plan!.next_reassessment_on).toBe(await daysAgo(-21));
    expect(panel.visitNumber).toBe(4);
    expect(panel.canWrite).toBe(true);

    await recordGoalProgress(asha, { goalId, appointmentId: v4, progress: "One flight with rail, no rests" }, "t");
    await checkIn(v4);
    const n = await saveNoteDraft(asha, { appointmentId: v4, subjective: "Managing stairs with rail", assessment: "Goal in progress", plan: "Wean off rail" }, "t");
    await signNote(asha, { noteId: n.noteId, expectedVersion: n.version }, "t");
    const g = (await getEpisode(asha, kneeEp)).goals.find((x) => x.id === goalId)!;
    expect(g.baseline).toBe("Needs rail, one step at a time, 3 rests");
    expect(g.progress.map((p) => p.progress)).toEqual(["One flight with rail, no rests"]);
    expect(g.status).toBe("ACTIVE");
  });

  it("a later correction keeps the signed version and names its author", async () => {
    await expectCode(saveNoteDraft(asha, { appointmentId: visits[0], expectedVersion: await version(note1), subjective: "rewrite" }, "t"), "INVALID_TRANSITION");
    await expectDbRefusal(`UPDATE clinical_note SET subjective='rewritten' WHERE id=$1`, [note1]);
    await expectDbRefusal(`DELETE FROM clinical_note WHERE id=$1`, [note1]);
    // Ravi joins the care team (assigned a visit) and adds a correction.
    const start = await futureSlot(f, f.branchA, f.therapist2, 11, 0);
    await createStaffBooking(frontDesk, { patientId, serviceId: f.sessionSvc, therapistId: f.therapist2, startsAt: start, source: "PHONE" }, "t");
    await addAddendum(ravi, { noteId: note1, body: "Correction: pain was 6/10, not 7/10." }, "t");
    const note = (await getEpisode(ravi, kneeEp)).notes.find((x) => x.id === note1)!;
    expect(note.subjective).toBe("Pain 7/10 on stairs");
    expect(note.author_name).toBe("Asha (physio)");
    expect(note.addenda.map((a) => [a.author_name, a.body])).toEqual([["Ravi (physio)", "Correction: pain was 6/10, not 7/10."]]);
    await expectDbRefusal(`UPDATE clinical_note_addendum SET body='x' WHERE note_id=$1`, [note1]);
  });

  it("two tabs starting the same note at once create one note", async () => {
    const start = await futureSlot(f, f.branchA, f.therapist1, 13, 0);
    const v = (await createStaffBooking(frontDesk, { patientId, serviceId: f.sessionSvc, therapistId: f.therapist1, startsAt: start, source: "PHONE" }, "t")).appointmentId;
    await linkAppointmentToEpisode(asha, { appointmentId: v, episodeId: kneeEp }, "t");
    const results = await Promise.allSettled([1, 2, 3].map((i) => saveNoteDraft(asha, { appointmentId: v, subjective: `tab ${i}` }, "t")));
    expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    expect((await q1<{ n: number }>(`SELECT count(*)::int n FROM clinical_note WHERE appointment_id=$1`, [v]))!.n).toBe(1);
  });

  it("discharge waits for drafts to be signed, then closes the episode to new goals and measurements", async () => {
    await expectCode(dischargeEpisode(asha, { episodeId: kneeEp, summary: "Stairs independent; continue HEP" }, "t"), "INVALID_TRANSITION"); // drafts open
    await dischargeEpisode(asha, { episodeId: shoulderEp, summary: "Resolved with posture advice" }, "t");
    await expectCode(addGoal(asha, { episodeId: shoulderEp, description: "Reach overhead", baseline: "Painful arc" }, "t"), "INVALID_TRANSITION");
    await expectCode(addMeasurement(asha, { episodeId: shoulderEp, kind: "PAIN", bodyRegion: "Shoulder", side: "LEFT", movement: "Overhead", value: 1, unit: "NPRS_0_10" }, "t"), "INVALID_TRANSITION");
    const chart = await getChart(asha, patientId);
    expect(chart.episodes.find((e) => e.id === shoulderEp)).toMatchObject({ status: "DISCHARGED" });
  });

  it("audit history holds who and what, never the clinical text", async () => {
    const rows = await q<{ changes: unknown }>(`SELECT changes FROM audit_event WHERE action LIKE 'clinical.%'`);
    expect(rows.length).toBeGreaterThan(10);
    const text = JSON.stringify(rows);
    for (const phrase of ["Pain 7/10", "Correction", "Quads", "Knee pain on stairs", "Climb one flight"]) expect(text).not.toContain(phrase);
  });
});
