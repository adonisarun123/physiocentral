"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { correlationId, DomainError } from "@/lib/errors";
import { getStaffActor } from "@/modules/auth/session";
import type { StaffActor } from "@/modules/auth/actor";
import type { ActionResult } from "@/components/action-form";
import {
  addAddendum, addGoal, addMeasurement, createEpisode, dischargeEpisode, linkAppointmentToEpisode, recordGoalProgress,
  recordIntake, revisePlan, saveNoteDraft, signNote, voidMeasurement,
} from "@/modules/clinical/records";

/* Clinical record actions. Authorisation and care-team checks live in the services. */

async function run(fn: (actor: StaffActor, cid: string) => Promise<string | void>, paths: string[] = []): Promise<ActionResult> {
  const actor = await getStaffActor();
  if (!actor) return { ok: false, error: "Your session has ended. Please sign in again.", code: "UNAUTHENTICATED" };
  const cid = correlationId();
  try {
    const message = await fn(actor, cid);
    for (const p of paths) revalidatePath(p);
    return { ok: true, message: message || "Saved." };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code, fieldErrors: e.fieldErrors };
    console.error(`[${cid}]`, e instanceof Error ? e.message : e);
    return { ok: false, error: `Something went wrong (ref ${cid.slice(0, 8)}). Nothing was changed.` };
  }
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => s(fd, k) || null;
const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : "");

/** Pages that show clinical data for this patient / visit. */
function paths(fd: FormData) {
  const out = [];
  const appt = uuid(s(fd, "appointmentId"));
  const patient = uuid(s(fd, "patientId"));
  const episode = uuid(s(fd, "episodeId"));
  if (appt) out.push(`/admin/appointments/${appt}`);
  if (patient) out.push(`/admin/chart/${patient}`);
  if (patient && episode) out.push(`/admin/chart/${patient}/episodes/${episode}`);
  return out;
}

export async function createEpisodeAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let target: string | null = null;
  const res = await run(async (a, cid) => {
    const r = await createEpisode(a, {
      patientId: s(fd, "patientId"), title: s(fd, "title"), bodyRegion: opt(fd, "bodyRegion"), side: opt(fd, "side"),
      workingDiagnosis: opt(fd, "workingDiagnosis"), referrer: opt(fd, "referrer"), openedOn: opt(fd, "openedOn"),
      attachLegacy: fd.get("attachLegacy") === "on", appointmentId: opt(fd, "appointmentId"),
    }, cid);
    if (!s(fd, "appointmentId")) target = `/admin/chart/${s(fd, "patientId")}/episodes/${r.episodeId}`;
    return "Episode started.";
  }, paths(fd));
  if (res?.ok && target) redirect(target);
  return res;
}

export async function linkEpisodeAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await linkAppointmentToEpisode(a, { appointmentId: s(fd, "appointmentId"), episodeId: s(fd, "episodeId") }, cid);
    return "Visit filed under the episode.";
  }, paths(fd));
}

export async function dischargeEpisodeAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await dischargeEpisode(a, { episodeId: s(fd, "episodeId"), closedOn: opt(fd, "closedOn"), summary: s(fd, "summary") }, cid);
    return "Episode discharged.";
  }, paths(fd));
}

export async function recordIntakeAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const r = await recordIntake(a, {
      patientId: s(fd, "patientId"), submissionKey: s(fd, "submissionKey"), episodeId: opt(fd, "episodeId"), appointmentId: opt(fd, "appointmentId"),
      mainConcern: s(fd, "mainConcern"), relevantHistory: opt(fd, "relevantHistory"), patientGoal: opt(fd, "patientGoal"),
      referrer: opt(fd, "referrer"), preferredLanguage: opt(fd, "preferredLanguage"), treatmentConsent: fd.get("treatmentConsent") === "on",
    }, cid);
    return r.duplicate ? "This intake was already saved." : "Intake saved for the physiotherapist.";
  }, [...paths(fd), `/admin/patients/${uuid(s(fd, "patientId"))}`]);
}

const noteInput = (fd: FormData) => ({
  subjective: opt(fd, "subjective"), objective: opt(fd, "objective"), assessment: opt(fd, "assessment"), plan: opt(fd, "plan"),
  interventions: opt(fd, "interventions"), patientResponse: opt(fd, "patientResponse"),
});

export async function saveNoteAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const v = s(fd, "noteVersion");
    const draft = await saveNoteDraft(a, { appointmentId: s(fd, "appointmentId"), expectedVersion: v ? Number(v) : null, ...noteInput(fd) }, cid);
    if (fd.get("intent") === "sign") {
      try {
        await signNote(a, { noteId: draft.noteId, expectedVersion: draft.version }, cid);
      } catch (e) {
        // The draft is already committed; say so rather than "nothing was changed".
        if (e instanceof DomainError) throw new DomainError(e.code, `Draft saved, but not signed: ${e.message}`, e.fieldErrors);
        throw e;
      }
      return "Note signed.";
    }
    return "Draft saved.";
  }, paths(fd));
}

export async function addendumAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await addAddendum(a, { noteId: s(fd, "noteId"), body: s(fd, "body") }, cid);
    return "Addendum added.";
  }, paths(fd));
}

export async function revisePlanAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await revisePlan(a, { episodeId: s(fd, "episodeId"), frequency: opt(fd, "frequency"), interventions: opt(fd, "interventions"), nextReassessmentOn: opt(fd, "nextReassessmentOn") }, cid);
    return "Plan updated.";
  }, paths(fd));
}

export async function addGoalAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await addGoal(a, { episodeId: s(fd, "episodeId"), description: s(fd, "description"), baseline: s(fd, "baseline"), targetOn: opt(fd, "targetOn") }, cid);
    return "Goal added.";
  }, paths(fd));
}

export async function goalProgressAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await recordGoalProgress(a, { goalId: s(fd, "goalId"), progress: s(fd, "progress"), status: opt(fd, "status"), appointmentId: opt(fd, "appointmentId") }, cid);
    return "Progress recorded.";
  }, paths(fd));
}

export async function addMeasurementAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await addMeasurement(a, {
      episodeId: s(fd, "episodeId"), appointmentId: opt(fd, "appointmentId"), measuredOn: opt(fd, "measuredOn"), kind: s(fd, "kind"),
      bodyRegion: s(fd, "bodyRegion"), side: s(fd, "side"), movement: s(fd, "movement"), value: s(fd, "value"), unit: s(fd, "unit"), observation: opt(fd, "observation"),
    }, cid);
    return "Measurement recorded.";
  }, paths(fd));
}

export async function voidMeasurementAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await voidMeasurement(a, { measurementId: s(fd, "measurementId"), reason: s(fd, "reason") }, cid);
    return "Marked as entered in error.";
  }, paths(fd));
}
