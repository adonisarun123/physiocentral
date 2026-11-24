"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { correlationId, DomainError } from "@/lib/errors";
import { getStaffActor } from "@/modules/auth/session";
import type { StaffActor } from "@/modules/auth/actor";
import type { ActionResult } from "@/components/action-form";
import { recordExpense, voidExpense } from "@/modules/finance/expenses";
import { setPackageValidity } from "@/modules/scheduling/staff-booking";
import { sendPaymentReminder, sendAllPaymentReminders } from "@/modules/billing/reminders";
import { deleteDocument } from "@/modules/patients/documents";
import { createHomeProgramme, saveExercise, setExerciseActive, stopHomeProgramme } from "@/modules/clinical/exercises";

/* Clinic operations: expenses, package validity, payment reminders, documents, home exercises.
   Authorisation lives in the services, as everywhere else. */

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
const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : "");
const optInt = (fd: FormData, k: string) => (s(fd, k) === "" ? null : Number(s(fd, k)));

// ───────────── Expenses ─────────────
export async function recordExpenseAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await recordExpense(a, {
      spentOn: s(fd, "spentOn"), category: s(fd, "category"), amountRupees: s(fd, "amountRupees"),
      paidVia: s(fd, "paidVia"), payee: s(fd, "payee"), note: s(fd, "note"),
    }, cid);
    return "Expense recorded.";
  }, ["/admin/expenses", "/admin/reports"]);
}

export async function voidExpenseAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await voidExpense(a, { expenseId: s(fd, "expenseId"), reason: s(fd, "reason") }, cid);
    return "Entry voided.";
  }, ["/admin/expenses", "/admin/reports"]);
}

// ───────────── Packages ─────────────
export async function packageValidityAction(_: ActionResult, fd: FormData) {
  const id = uuid(s(fd, "packageId"));
  return run(async (a, cid) => {
    await setPackageValidity(a, { packageId: id, validUntil: s(fd, "validUntil") || null, reason: s(fd, "reason") }, cid);
    return "Validity updated.";
  }, ["/admin/packages", `/admin/packages/${id}`]);
}

// ───────────── Payment reminders ─────────────
export async function sendReminderAction(_: ActionResult, fd: FormData) {
  const patientId = uuid(s(fd, "patientId"));
  return run(async (a, cid) => {
    const r = await sendPaymentReminder(a, { patientId }, cid);
    return `Reminder emailed to ${r.sentTo}.`;
  }, ["/admin/reminders", `/admin/patients/${patientId}`]);
}

export async function sendAllRemindersAction(_: ActionResult, _fd: FormData) {
  void _fd;
  return run(async (a, cid) => {
    const r = await sendAllPaymentReminders(a, cid);
    const parts = [`${r.sent} sent`];
    if (r.failed) parts.push(`${r.failed} failed`);
    if (r.skipped) parts.push(`${r.skipped} skipped (no email, reminded in the last 3 days, or opted out)`);
    return `Reminders: ${parts.join(", ")}.`;
  }, ["/admin/reminders"]);
}

// ───────────── Documents ─────────────
export async function deleteDocumentAction(_: ActionResult, fd: FormData) {
  const patientId = uuid(s(fd, "patientId"));
  return run(async (a, cid) => {
    await deleteDocument(a, { documentId: s(fd, "documentId"), reason: s(fd, "reason") }, cid);
    return "Document removed from the record.";
  }, [`/admin/chart/${patientId}`, `/admin/patients/${patientId}`]);
}

// ───────────── Home exercises ─────────────
export async function saveExerciseAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await saveExercise(a, {
      id: uuid(s(fd, "exerciseId")) || null, name: s(fd, "name"), bodyRegion: s(fd, "bodyRegion"), instructions: s(fd, "instructions"),
      sets: optInt(fd, "sets"), reps: optInt(fd, "reps"), holdSeconds: optInt(fd, "holdSeconds"),
    }, cid);
    return "Exercise saved.";
  }, ["/admin/exercises"]);
}

export async function exerciseActiveAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const active = s(fd, "active") === "1";
    await setExerciseActive(a, { exerciseId: s(fd, "exerciseId"), active }, cid);
    return active ? "Exercise restored." : "Exercise hidden from new sheets.";
  }, ["/admin/exercises"]);
}

export async function createHomeProgrammeAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const patientId = uuid(s(fd, "patientId"));
  let id: string | null = null;
  const res = await run(async (a, cid) => {
    const count = Math.min(Number(s(fd, "rowCount")) || 0, 30);
    const items = Array.from({ length: count }, (_, i) => ({
      exerciseId: uuid(s(fd, `r${i}exercise`)) || null, name: s(fd, `r${i}name`), instructions: s(fd, `r${i}instructions`),
      sets: optInt(fd, `r${i}sets`), reps: optInt(fd, `r${i}reps`), holdSeconds: optInt(fd, `r${i}hold`),
      timesPerDay: optInt(fd, `r${i}perDay`), daysPerWeek: optInt(fd, `r${i}perWeek`), note: s(fd, `r${i}note`),
    }));
    const r = await createHomeProgramme(a, {
      patientId, episodeId: uuid(s(fd, "episodeId")) || null, title: s(fd, "title"), advice: s(fd, "advice"), items,
    }, cid);
    id = r.programmeId;
  }, [`/admin/chart/${patientId}`]);
  if (res?.ok && id) redirect(`/admin/exercise-sheets/${id}`);
  return res;
}

export async function stopHomeProgrammeAction(_: ActionResult, fd: FormData) {
  const patientId = uuid(s(fd, "patientId"));
  return run(async (a, cid) => {
    await stopHomeProgramme(a, { programmeId: s(fd, "programmeId") }, cid);
    return "Sheet marked as stopped.";
  }, [`/admin/chart/${patientId}`]);
}
