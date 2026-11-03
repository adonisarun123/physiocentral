"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { correlationId, DomainError } from "@/lib/errors";
import { getStaffActor } from "@/modules/auth/session";
import type { StaffActor } from "@/modules/auth/actor";
import type { ActionResult } from "@/components/action-form";
import { acceptAppointment, cancelAppointment, rejectAppointment, transitionAppointment, type TransitionName } from "@/modules/scheduling/appointments";
import { addEstimateLine, createEstimate, decideEstimate, markEstimateLinePerformed, removeEstimateLine, reviseEstimate, sendEstimateVersion } from "@/modules/billing/estimates";
import { createDraftInvoice, discardDraftInvoice, issueInvoice } from "@/modules/billing/invoices";
import { allocatePayment, recordManualPayment, verifyPayment } from "@/modules/payments/manual";
import { addPriceVersion, setServiceStatus } from "@/modules/catalog/admin";

/**
 * Every action re-authenticates and authorises inside the domain service
 * (AUTH-01, SEC-03). Server Action transport protections are not authorisation.
 */
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
const n = (fd: FormData, k: string) => Number(fd.get(k));

export async function acceptAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const r = await acceptAppointment(a, { appointmentId: s(fd, "id"), expectedVersion: n(fd, "version"), therapistId: s(fd, "therapistId") || null }, cid);
    return `Confirmed ${r.reference}.`;
  }, ["/admin/requests", "/admin", "/admin/calendar"]);
}

export async function rejectAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await rejectAppointment(a, { appointmentId: s(fd, "id"), expectedVersion: n(fd, "version"), patientMessage: s(fd, "patientMessage"), internalNote: s(fd, "internalNote") }, cid);
    return "Request rejected.";
  }, ["/admin/requests", "/admin"]);
}

export async function transitionAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const r = await transitionAppointment(a, { appointmentId: s(fd, "id"), expectedVersion: n(fd, "version"), transition: s(fd, "transition") as TransitionName }, cid);
    return r.status === "COMPLETED" && !r.chargeId ? "Completed. No active price for this service, so no charge was created." : "Updated.";
  }, [`/admin/appointments/${s(fd, "id")}`, "/admin/calendar", "/admin"]);
}

export async function cancelAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await cancelAppointment(a, { appointmentId: s(fd, "id"), expectedVersion: n(fd, "version"), reason: s(fd, "reason") }, cid);
    return "Cancelled and capacity released.";
  }, [`/admin/appointments/${s(fd, "id")}`, "/admin/calendar", "/admin"]);
}

export async function createEstimateAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => { await createEstimate(a, s(fd, "appointmentId"), cid); return "Draft estimate created."; }, [`/admin/appointments/${s(fd, "appointmentId")}`]);
}

export async function addEstimateLineAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await addEstimateLine(a, { versionId: s(fd, "versionId"), serviceId: s(fd, "serviceId"), quantity: s(fd, "quantity") || "1", isExtra: fd.get("isExtra") === "on", reason: s(fd, "reason") }, cid);
    return "Line added.";
  }, [`/admin/appointments/${s(fd, "appointmentId")}`]);
}

export async function removeEstimateLineAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => { await removeEstimateLine(a, s(fd, "lineId"), cid); return "Line removed."; }, [`/admin/appointments/${s(fd, "appointmentId")}`]);
}

export async function sendEstimateAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => { await sendEstimateVersion(a, s(fd, "versionId"), cid); return "Sent. The patient can review it via their secure link."; }, [`/admin/appointments/${s(fd, "appointmentId")}`]);
}

export async function reviseEstimateAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => { await reviseEstimate(a, s(fd, "versionId"), cid); return "New draft version created; previous version superseded."; }, [`/admin/appointments/${s(fd, "appointmentId")}`]);
}

export async function offlineDecisionAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await decideEstimate(a, {
      versionId: s(fd, "versionId"), contentHash: s(fd, "contentHash"),
      decision: s(fd, "decision") === "DECLINED" ? "DECLINED" : "ACCEPTED",
      method: s(fd, "method") === "STAFF_RECORDED_PHONE" ? "STAFF_RECORDED_PHONE" : "STAFF_RECORDED_IN_PERSON",
      attestation: s(fd, "attestation"),
    }, cid);
    return "Patient decision recorded.";
  }, [`/admin/appointments/${s(fd, "appointmentId")}`]);
}

export async function markPerformedAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => { await markEstimateLinePerformed(a, s(fd, "lineId"), cid); return "Recorded as performed; now billable."; }, [`/admin/appointments/${s(fd, "appointmentId")}`]);
}

export async function createInvoiceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let invoiceId: string | null = null;
  const res = await run(async (a, cid) => {
    const r = await createDraftInvoice(a, { patientId: s(fd, "patientId"), chargeIds: fd.getAll("chargeId").map(String), appointmentId: s(fd, "appointmentId") || null }, cid);
    invoiceId = r.invoiceId;
  }, [`/admin/appointments/${s(fd, "appointmentId")}`, "/admin/invoices"]);
  if (res?.ok && invoiceId) redirect(`/admin/invoices/${invoiceId}`);
  return res;
}

export async function issueInvoiceAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => { const r = await issueInvoice(a, { invoiceId: s(fd, "id"), expectedVersion: n(fd, "version") }, cid); return `Issued ${r.number}.`; }, [`/admin/invoices/${s(fd, "id")}`, "/admin/invoices"]);
}

export async function discardInvoiceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const res = await run(async (a, cid) => { await discardDraftInvoice(a, s(fd, "id"), n(fd, "version"), cid); }, ["/admin/invoices"]);
  if (res?.ok) redirect("/admin/invoices");
  return res;
}

export async function recordPaymentAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const r = await recordManualPayment(a, {
      patientId: s(fd, "patientId"), method: s(fd, "method"), amountRupees: s(fd, "amountRupees"), receivedOn: s(fd, "receivedOn"),
      receivingAccount: s(fd, "receivingAccount"), reference: s(fd, "reference") || undefined, note: s(fd, "note") || undefined,
      intendedInvoiceId: s(fd, "invoiceId") || undefined, verifyNow: fd.get("verifyNow") === "on",
    }, cid);
    return r.receiptNumber ? `Payment verified. Receipt ${r.receiptNumber}.` : "Payment recorded as PENDING verification.";
  }, [`/admin/invoices/${s(fd, "invoiceId")}`, "/admin/payments"]);
}

export async function verifyPaymentAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const r = await verifyPayment(a, { paymentId: s(fd, "paymentId"), allocateToInvoiceId: s(fd, "invoiceId") || null }, cid);
    return `Verified. Receipt ${r.receiptNumber}.`;
  }, ["/admin/payments", "/admin/invoices"]);
}

export async function allocateAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => { await allocatePayment(a, { paymentId: s(fd, "paymentId"), invoiceId: s(fd, "invoiceId"), amountRupees: s(fd, "amountRupees") }, cid); return "Allocated."; },
    [`/admin/invoices/${s(fd, "invoiceId")}`, "/admin/payments"]);
}

export async function addPriceAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => { await addPriceVersion(a, { serviceId: s(fd, "serviceId"), amountRupees: s(fd, "amountRupees"), effectiveFrom: s(fd, "effectiveFrom") || null }, cid); return "Price version added."; }, ["/admin/catalog"]);
}

export async function serviceStatusAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await setServiceStatus(a, {
      serviceId: s(fd, "serviceId"), status: s(fd, "status") as "DRAFT" | "ACTIVE" | "ARCHIVED",
      public: fd.get("public") === "on", bookable: fd.get("bookable") === "on",
      clinicalReviewer: s(fd, "clinicalReviewer"), reviewedOn: s(fd, "reviewedOn"),
    }, cid);
    return "Service updated.";
  }, ["/admin/catalog", "/services"]);
}
