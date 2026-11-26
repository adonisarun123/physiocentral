"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { correlationId, DomainError } from "@/lib/errors";
import { getStaffActor } from "@/modules/auth/session";
import type { StaffActor } from "@/modules/auth/actor";
import type { ActionResult } from "@/components/action-form";
import { acceptAppointment, cancelAppointment, rejectAppointment, transitionAppointment, type TransitionName } from "@/modules/scheduling/appointments";
import { addEstimateLine, createEstimate, decideEstimate, markEstimateLinePerformed, removeEstimateLine, reviseEstimate, sendEstimateVersion } from "@/modules/billing/estimates";
import { applyBillDiscount, createDirectInvoice, createDraftInvoice, discardDraftInvoice, issueInvoice } from "@/modules/billing/invoices";
import { createPatient, updatePatient, attachRequestToPatient } from "@/modules/patients/admin";
import { createPackageBooking, createStaffBooking, setPackageStatus } from "@/modules/scheduling/staff-booking";
import { createStaffLogin, resetStaffPassword, setStaffActive, updateStaff } from "@/modules/staff/admin";
import { formatINR, formatPercentBp } from "@/modules/billing/money";
import { allocatePayment, recordManualPayment, verifyPayment } from "@/modules/payments/manual";
import { refundPayment, reversePayment } from "@/modules/payments/refunds";
import { addPriceVersion, createService, setServiceStatus, updateServiceDetails } from "@/modules/catalog/admin";
import { addTimeOff, createTherapist, removeTimeOff, setTherapistActive, setTherapistHours, setTherapistServices, shiftsFromForm, updateTherapistProfile } from "@/modules/clinic/team";

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

export async function billDiscountAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const raw = s(fd, "type");
    const type = raw === "PERCENT" || raw === "AMOUNT" ? raw : "NONE";
    const r = await applyBillDiscount(a, { invoiceId: s(fd, "id"), expectedVersion: n(fd, "version"), type, value: s(fd, "value"), reason: s(fd, "reason") }, cid);
    if (type === "NONE") return "Discount removed.";
    return `Discount of ${formatINR(r.discountPaise)}${r.percentBp !== null ? ` (${formatPercentBp(r.percentBp)})` : ""} applied.`;
  }, [`/admin/invoices/${s(fd, "id")}`, "/admin/invoices"]);
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
  }, [`/admin/invoices/${s(fd, "invoiceId")}`, "/admin/payments", `/admin/patients/${s(fd, "patientId")}`]);
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

export async function refundPaymentAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const r = await refundPayment(a, {
      paymentId: s(fd, "paymentId"), amountRupees: s(fd, "amountRupees"), method: s(fd, "method"), refundedOn: s(fd, "refundedOn"),
      paidFrom: s(fd, "paidFrom"), reference: s(fd, "reference") || undefined, reason: s(fd, "reason"),
      appointmentId: s(fd, "appointmentId") || undefined, creditBills: fd.get("creditBills") === "on",
    }, cid);
    const bills = r.creditNotes.length ? ` Bill reduced by credit note ${r.creditNotes.join(", ")}.`
      : r.releasedFrom.length ? ` ${r.releasedFrom.join(", ")} is unpaid again for that amount.` : "";
    return `Refund recorded. Voucher ${r.number}.${bills}`;
  }, [`/admin/payments/${s(fd, "paymentId")}`, "/admin/payments", "/admin/invoices", `/admin/patients/${s(fd, "patientId")}`,
      ...(s(fd, "appointmentId") ? [`/admin/appointments/${s(fd, "appointmentId")}`] : [])]);
}

export async function reversePaymentAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const r = await reversePayment(a, { paymentId: s(fd, "paymentId"), reason: s(fd, "reason") }, cid);
    return r.releasedFrom.length ? `Entry reversed. ${r.releasedFrom.join(", ")} is unpaid again.` : "Entry reversed.";
  }, [`/admin/payments/${s(fd, "paymentId")}`, "/admin/payments", "/admin/invoices", `/admin/patients/${s(fd, "patientId")}`]);
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

// ───────────── Catalog: add / edit services ─────────────
const lines = (fd: FormData, k: string) => s(fd, k).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const serviceDetails = (fd: FormData) => ({
  name: s(fd, "name"), categoryId: s(fd, "categoryId") || null, durationMinutes: n(fd, "durationMinutes"),
  billingUnit: s(fd, "billingUnit"), summary: s(fd, "summary"), headline: s(fd, "headline"), body: s(fd, "body"),
  whoItMayHelp: s(fd, "whoItMayHelp"), conditions: lines(fd, "conditions"),
});

export async function createServiceAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const r = await createService(a, { ...serviceDetails(fd), priceRupees: s(fd, "priceRupees"), allTherapists: fd.get("allTherapists") === "on" }, cid);
    return `Added as a draft (${r.code}). Open it below to set status and visibility when ready.`;
  }, ["/admin/catalog"]);
}

export async function updateServiceAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => { await updateServiceDetails(a, { serviceId: s(fd, "serviceId"), ...serviceDetails(fd) }, cid); return "Details saved."; }, ["/admin/catalog", "/services"]);
}

// ───────────── Team & schedule ─────────────
export async function createTherapistAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id: string | null = null;
  const res = await run(async (a, cid) => {
    const r = await createTherapist(a, {
      displayName: s(fd, "displayName"), designation: s(fd, "designation"), bio: s(fd, "bio"),
      languages: s(fd, "languages").split(",").map((x) => x.trim()).filter(Boolean),
      serviceIds: fd.getAll("serviceId").map(String), shifts: shiftsFromForm(fd),
    }, cid);
    id = r.therapistId;
  }, ["/admin/team", "/book"]);
  if (res?.ok && id) redirect(`/admin/team/${id}?created=1`);
  return res;
}

export async function updateTherapistAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await updateTherapistProfile(a, {
      therapistId: s(fd, "therapistId"), displayName: s(fd, "displayName"), designation: s(fd, "designation"), bio: s(fd, "bio"),
      languages: s(fd, "languages").split(",").map((x) => x.trim()).filter(Boolean),
      credentialsVerified: fd.get("credentialsVerified") === "on", public: fd.get("public") === "on",
    }, cid);
    return "Profile saved.";
  }, ["/admin/team", `/admin/team/${s(fd, "therapistId")}`, "/"]);
}

export async function therapistActiveAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const active = s(fd, "active") === "true";
    await setTherapistActive(a, { therapistId: s(fd, "therapistId"), active }, cid);
    return active ? "Reactivated. They can be booked again." : "Deactivated. They no longer appear in online slots.";
  }, ["/admin/team", `/admin/team/${s(fd, "therapistId")}`, "/book"]);
}

export async function therapistServicesAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => { await setTherapistServices(a, { therapistId: s(fd, "therapistId"), serviceIds: fd.getAll("serviceId").map(String) }, cid); return "Services saved."; },
    [`/admin/team/${s(fd, "therapistId")}`, "/book"]);
}

export async function therapistHoursAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const r = await setTherapistHours(a, { therapistId: s(fd, "therapistId"), shifts: shiftsFromForm(fd) }, cid);
    return r.outsideHours ? `Hours saved. Note: ${r.outsideHours} upcoming confirmed appointment(s) now fall outside these hours — they are kept; rebook if needed.` : "Hours saved. Online slots updated.";
  }, [`/admin/team/${s(fd, "therapistId")}`, "/admin/schedule", "/", "/book", "/contact"]);
}

export async function addTimeOffAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const r = await addTimeOff(a, {
      therapistId: s(fd, "therapistId") || null, fromDate: s(fd, "fromDate"), toDate: s(fd, "toDate"),
      fromTime: s(fd, "fromTime"), toTime: s(fd, "toTime"), reason: s(fd, "reason"),
    }, cid);
    return r.clashes ? `Blocked. ${r.clashes} existing appointment(s)/request(s) fall in this period — contact those patients to rebook.` : "Blocked. No online bookings can be made in this period.";
  }, ["/admin/schedule", `/admin/team/${s(fd, "therapistId")}`, "/book"]);
}

export async function removeTimeOffAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => { await removeTimeOff(a, s(fd, "id"), cid); return "Removed. Those times are open again."; },
    ["/admin/schedule", `/admin/team/${s(fd, "therapistId")}`, "/book"]);
}

// ───────────── Patients, staff booking, direct invoices ─────────────
/** Only allow redirects back into the admin area. */
const safeNext = (v: string) => (/^\/admin\/[a-z/-]*(\?[\w=&%-]*)?$/i.test(v) ? v : "");
// Contact/registration only. Clinical detail is recorded in the chart (episodes, notes), not on the registration form.
const profile = (fd: FormData) => ({ age: s(fd, "age"), sex: s(fd, "sex"), address: s(fd, "address") });

export async function createPatientAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id: string | null = null;
  const res = await run(async (a, cid) => {
    const r = await createPatient(a, { fullName: s(fd, "fullName"), phone: s(fd, "phone"), email: s(fd, "email"), ...profile(fd), isNewPatient: true, allowDuplicate: fd.get("allowDuplicate") === "on" }, cid);
    id = r.patientId;
  }, ["/admin/patients"]);
  if (res?.ok && id) {
    const next = safeNext(s(fd, "next"));
    redirect(next ? `${next}${next.includes("?") ? "&" : "?"}patient=${id}` : `/admin/patients/${id}`);
  }
  return res;
}

export async function attachRequestToPatientAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const r = await attachRequestToPatient(a, { appointmentId: s(fd, "id"), expectedVersion: n(fd, "version"), patientId: s(fd, "patientId") }, cid);
    return `Moved to ${r.patientName} (${r.patientNumber}). The extra record was archived.`;
  }, ["/admin/requests", `/admin/appointments/${s(fd, "id")}`, "/admin/patients", `/admin/patients/${s(fd, "patientId")}`]);
}

export async function updatePatientAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await updatePatient(a, { patientId: s(fd, "patientId"), fullName: s(fd, "fullName"), phone: s(fd, "phone"), email: s(fd, "email"), ...profile(fd) }, cid);
    return "Patient details saved.";
  }, [`/admin/patients/${s(fd, "patientId")}`, "/admin/patients"]);
}

export async function staffBookAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id: string | null = null;
  const res = await run(async (a, cid) => {
    const r = await createStaffBooking(a, {
      patientId: s(fd, "patientId"), serviceId: s(fd, "serviceId"), therapistId: s(fd, "therapistId") || null,
      startsAt: s(fd, "startsAt"), source: s(fd, "source") === "WALK_IN" ? "WALK_IN" : "PHONE", reason: s(fd, "reason"),
      packageId: s(fd, "packageId") || null,
    }, cid);
    id = r.appointmentId;
  }, ["/admin", "/admin/calendar", "/admin/packages", `/admin/patients/${s(fd, "patientId")}`]);
  if (res?.ok && id) redirect(s(fd, "packageId") ? `/admin/packages/${s(fd, "packageId")}` : `/admin/appointments/${id}?booked=1`);
  return res;
}

/** "Book as package": `plan` is "<sessions>|<name>|<price rupees>" from the package list, or "custom". */
export async function packageBookAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id: string | null = null;
  let note = "";
  const res = await run(async (a, cid) => {
    const plan = s(fd, "plan");
    let sessions: number, name: string, price: number | null;
    if (plan === "custom") {
      sessions = n(fd, "customSessions");
      name = `${sessions}-session package`;
      price = s(fd, "customPrice") ? Math.round(Number(s(fd, "customPrice")) * 100) : null;
      if (price !== null && !Number.isFinite(price)) throw new DomainError("VALIDATION", "Enter a valid package price in rupees.");
    } else {
      const [cnt, label, rupees] = plan.split("|");
      sessions = Number(cnt); name = label ?? ""; price = rupees ? Math.round(Number(rupees) * 100) : null;
    }
    const r = await createPackageBooking(a, {
      patientId: s(fd, "patientId"), serviceId: s(fd, "serviceId"), therapistId: s(fd, "therapistId") || null,
      startsAt: s(fd, "startsAt"), source: s(fd, "source") === "WALK_IN" ? "WALK_IN" : "PHONE", reason: s(fd, "reason"),
      name, sessions, pricePaise: price, validDays: s(fd, "validDays") ? n(fd, "validDays") : defaultValidDays(sessions),
    }, cid);
    id = r.packageId;
    note = r.booked < r.sessions ? `&short=${r.sessions - r.booked}` : "";
  }, ["/admin", "/admin/calendar", "/admin/packages", `/admin/patients/${s(fd, "patientId")}`]);
  if (res?.ok && id) redirect(`/admin/packages/${id}?booked=1${note}`);
  return res;
}

/** Default package validity when staff leave it blank: twice the sessions, at least a week. */
function defaultValidDays(sessions: number) {
  return Number.isFinite(sessions) && sessions > 0 ? Math.min(365, Math.max(7, sessions * 2)) : null;
}

export async function packageStatusAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const status = s(fd, "status") === "ACTIVE" ? "ACTIVE" : "CLOSED";
    await setPackageStatus(a, { packageId: s(fd, "packageId"), status }, cid);
    return status === "CLOSED" ? "Package closed." : "Package reopened.";
  }, ["/admin/packages", `/admin/packages/${s(fd, "packageId")}`]);
}

export async function directInvoiceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id: string | null = null;
  const res = await run(async (a, cid) => {
    const count = Math.min(n(fd, "lineCount") || 0, 20);
    const lines = Array.from({ length: count }, (_, i) => ({
      serviceId: s(fd, `l${i}service`) || null, description: s(fd, `l${i}desc`), quantity: s(fd, `l${i}qty`),
      unitPriceRupees: s(fd, `l${i}price`), discountRupees: s(fd, `l${i}disc`),
      discountType: s(fd, `l${i}discType`) === "PERCENT" ? "PERCENT" as const : "AMOUNT" as const,
    }));
    const r = await createDirectInvoice(a, { patientId: s(fd, "patientId"), lines }, cid);
    id = r.invoiceId;
  }, ["/admin/invoices", `/admin/patients/${s(fd, "patientId")}`]);
  if (res?.ok && id) redirect(`/admin/invoices/${id}`);
  return res;
}

// ───────────── Staff logins ─────────────
export async function createStaffAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const r = await createStaffLogin(a, { name: s(fd, "name"), email: s(fd, "email"), roles: fd.getAll("role").map(String), therapistId: s(fd, "therapistId") || null }, cid);
    return `Login created for ${r.email}. One-time password: ${r.tempPassword} — give it to them in person (not by WhatsApp/email). It is not shown again; they change it and turn on two-step verification at /admin/security.`;
  }, ["/admin/staff"]);
}

export async function updateStaffAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    await updateStaff(a, { staffId: s(fd, "staffId"), name: s(fd, "name"), roles: fd.getAll("role").map(String), therapistId: s(fd, "therapistId") || null }, cid);
    return "Saved. New permissions apply on their next page load.";
  }, ["/admin/staff"]);
}

export async function staffActiveAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const active = s(fd, "active") === "true";
    await setStaffActive(a, { staffId: s(fd, "staffId"), active }, cid);
    return active ? "Login re-enabled." : "Login disabled and signed out everywhere.";
  }, ["/admin/staff"]);
}

export async function resetStaffPasswordAction(_: ActionResult, fd: FormData) {
  return run(async (a, cid) => {
    const r = await resetStaffPassword(a, s(fd, "staffId"), cid);
    return `New one-time password: ${r.tempPassword} — give it to them in person. They have been signed out everywhere.`;
  }, ["/admin/staff"]);
}
