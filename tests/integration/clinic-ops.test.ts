import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getPool, q, q1 } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { permissionsFor, type Role } from "@/modules/auth/permissions";
import type { StaffActor } from "@/modules/auth/actor";
import { createPatient } from "@/modules/patients/admin";
import { createPackageBooking, createStaffBooking, setPackageValidity } from "@/modules/scheduling/staff-booking";
import { cancelAppointment, transitionAppointment } from "@/modules/scheduling/appointments";
import { getPackage, listPackages } from "@/modules/scheduling/packages";
import { createDirectInvoice, issueInvoice } from "@/modules/billing/invoices";
import { recordManualPayment } from "@/modules/payments/manual";
import { recordExpense, voidExpense, listExpenses } from "@/modules/finance/expenses";
import { dayWise, profitAndExpenses } from "@/modules/reports";
import { deleteDocument, documentCount, listDocuments, openDocument, uploadDocument } from "@/modules/patients/documents";
import { createHomeProgramme, getHomeProgramme, listHomeProgrammes, saveExercise, stopHomeProgramme } from "@/modules/clinical/exercises";
import { listOutstanding, sendAllPaymentReminders, sendPaymentReminder } from "@/modules/billing/reminders";
import { setMailTransportForTests } from "@/modules/notifications/mailer";
import { buildFixture, futureSlot, resetDatabase, type Fixture } from "./helpers";

let f: Fixture;
let asha: StaffActor; // physio linked to therapist1
let ravi: StaffActor; // physio linked to therapist2
let lead: StaffActor; // clinical lead linked to therapist2
let accountant: StaffActor;
let today: string;

async function expectCode(p: Promise<unknown>, code: string, msg?: RegExp) {
  try { await p; } catch (e) {
    if (e instanceof DomainError) { expect(e.code).toBe(code); if (msg) expect(e.message).toMatch(msg); return; }
    throw e;
  }
  throw new Error(`expected DomainError ${code}, but the call succeeded`);
}
async function staff(name: string, roles: Role[], therapistId?: string): Promise<StaffActor> {
  const db = getPool();
  const s = (await db.query(`INSERT INTO staff_member (organization_id, auth_user_id, display_name) VALUES ($1,$2,$3) RETURNING id`, [f.orgId, randomUUID(), name])).rows[0];
  for (const r of roles) await db.query(`INSERT INTO role_grant (organization_id, staff_member_id, role) VALUES ($1,$2,$3)`, [f.orgId, s.id, r]);
  if (therapistId) await db.query(`UPDATE therapist SET staff_member_id=$2 WHERE id=$1`, [therapistId, s.id]);
  return { kind: "staff", staffId: s.id, organizationId: f.orgId, displayName: name, authUserId: "x", roles, permissions: permissionsFor(roles), label: `staff:${s.id}` };
}
const version = async (id: string) => (await q1<{ version: number }>(`SELECT version FROM appointment WHERE id=$1`, [id]))!.version;
const go = async (id: string, transition: "check_in" | "start" | "complete" | "no_show") =>
  transitionAppointment(f.receptionist, { appointmentId: id, expectedVersion: await version(id), transition }, "t");
const newPatient = async (name: string, email = "") =>
  (await createPatient(f.receptionist, { fullName: name, phone: `98${Math.floor(10000000 + Math.random() * 89999999)}`, email }, "t")).patientId;
async function issuedBill(patientId: string, rupees: string) {
  const { invoiceId } = await createDirectInvoice(f.receptionist, { patientId, lines: [{ description: "Session", unitPriceRupees: rupees }] }, "t");
  const v = (await q1<{ version: number }>(`SELECT version FROM invoice WHERE id=$1`, [invoiceId]))!;
  await issueInvoice(f.billing, { invoiceId, expectedVersion: v.version }, "t");
  return invoiceId;
}
const pdf = () => new TextEncoder().encode(`%PDF-1.4\n% test ${randomUUID()}\n%%EOF`);

beforeAll(async () => {
  await resetDatabase();
  f = await buildFixture();
  asha = await staff("Asha (physio)", ["PHYSIOTHERAPIST"], f.therapist1);
  ravi = await staff("Ravi (physio)", ["PHYSIOTHERAPIST"]);
  lead = await staff("Dr Lead", ["PHYSIOTHERAPIST", "CLINICAL_LEAD"], f.therapist2);
  accountant = await staff("Accounts", ["ACCOUNTANT"]);
  today = (await q1<{ d: string }>(`SELECT to_char((now() AT TIME ZONE 'Asia/Kolkata')::date,'YYYY-MM-DD') d`))!.d;
});
afterAll(async () => { setMailTransportForTests(null); await getPool().end(); });

// ───────────────────────── 1. Expenses and profit ─────────────────────────
describe("expenses and profit", () => {
  it("records expenses, refuses bad input and non-finance roles, and voids with a reason", async () => {
    await expectCode(recordExpense(f.physio, { spentOn: today, category: "RENT", amountRupees: "100", paidVia: "CASH" }, "t"), "FORBIDDEN");
    await expectCode(recordExpense(f.receptionist, { spentOn: "2099-01-01", category: "NOPE", amountRupees: "-5", paidVia: "CASH" }, "t"), "VALIDATION");
    await expectCode(recordExpense(f.receptionist, { spentOn: today, category: "OTHER", amountRupees: "50", paidVia: "CASH" }, "t"), "VALIDATION");
    const rent = await recordExpense(f.owner, { spentOn: today, category: "RENT", amountRupees: "25000", paidVia: "BANK_TRANSFER", payee: "Landlord" }, "t");
    await recordExpense(f.receptionist, { spentOn: today, category: "CONSUMABLES", amountRupees: "450.50", paidVia: "CASH", note: "KT tape" }, "t");
    const wrong = await recordExpense(f.receptionist, { spentOn: today, category: "UTILITIES", amountRupees: "999", paidVia: "UPI" }, "t");
    expect(rent.amountPaise).toBe("2500000");
    // Reception can enter but not void; voiding needs finance access too.
    await expectCode(voidExpense(f.receptionist, { expenseId: wrong.expenseId, reason: "typo" }, "t"), "FORBIDDEN");
    await expectCode(voidExpense(f.owner, { expenseId: wrong.expenseId, reason: "" }, "t"), "VALIDATION");
    await voidExpense(f.owner, { expenseId: wrong.expenseId, reason: "Entered twice" }, "t");
    await expectCode(voidExpense(accountant, { expenseId: wrong.expenseId, reason: "again" }, "t"), "INVALID_TRANSITION");
    const listed = await listExpenses(f.owner, today, today);
    expect(listed).toHaveLength(3);
    expect(listed.find((e) => e.id === wrong.expenseId)?.status).toBe("VOIDED");
  });

  it("shows profit = verified collections − refunds − expenses, and the day report agrees", async () => {
    const p = await newPatient("Profit Patient");
    const inv = await issuedBill(p, "3000");
    await recordManualPayment(f.billing, { patientId: p, method: "CASH", amountRupees: "2000", receivedOn: today, receivingAccount: "Front desk", verifyNow: true, intendedInvoiceId: inv }, "t");
    // Pending (unverified) money is not counted.
    await recordManualPayment(f.receptionist, { patientId: p, method: "CASH", amountRupees: "1000", receivedOn: today, receivingAccount: "Front desk" }, "t");
    const { summary, categories } = await profitAndExpenses(f.owner, today, today);
    expect(summary.collected_paise).toBe("200000");
    expect(summary.expenses_paise).toBe("2545050"); // 25000 + 450.50; voided 999 left out
    expect(summary.profit_paise).toBe(String(200000 - 2545050));
    expect(summary.outstanding_paise).toBe("100000");
    expect(categories.map((c) => c.category)).toEqual(["RENT", "CONSUMABLES"]);
    const [d] = await dayWise(f.owner, today, today);
    expect(d.expenses_paise).toBe("2545050");
    expect(d.profit_paise).toBe(summary.profit_paise);
    await expectCode(profitAndExpenses(f.receptionist, today, today), "FORBIDDEN");
  });
});

// ───────────────────────── 3. Packages: expiry, deduction at check-in ─────────────────────────
describe("package expiry and check-in deduction", () => {
  let pkgId: string;
  let sessions: string[];
  let patientId: string;

  it("sets the expiry from the first session and caps bookings by it", async () => {
    patientId = await newPatient("Package Patient");
    await expectCode(createPackageBooking(f.receptionist, {
      patientId, serviceId: f.sessionSvc, therapistId: f.therapist1, startsAt: await futureSlot(f, f.branchA, f.therapist1, 0, 2),
      source: "PHONE", name: "5-day", sessions: 5, pricePaise: 500000, validDays: 3,
    }, "t"), "VALIDATION", /at least 5 days/);
    const startsAt = await futureSlot(f, f.branchA, f.therapist1, 0, 2);
    const r = await createPackageBooking(f.receptionist, {
      patientId, serviceId: f.sessionSvc, therapistId: f.therapist1, startsAt, source: "PHONE", name: "3-day", sessions: 3, pricePaise: 300000, validDays: 5,
    }, "t");
    pkgId = r.packageId;
    const firstDay = (await q1<{ d: string }>(`SELECT to_char(($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date + 4,'YYYY-MM-DD') d`, [startsAt]))!.d;
    expect(r.validUntil).toBe(firstDay);
    expect(r.booked).toBe(3);
    sessions = (await q<{ id: string }>(`SELECT id FROM appointment WHERE package_id=$1 ORDER BY starts_at`, [pkgId])).map((x) => x.id);
    // Adding a visit after expiry is refused.
    await cancelAppointment(f.receptionist, { appointmentId: sessions[2], reason: "patient travelling", expectedVersion: await version(sessions[2]) }, "t");
    await expectCode(createStaffBooking(f.receptionist, {
      patientId, serviceId: f.sessionSvc, therapistId: f.therapist1, startsAt: await futureSlot(f, f.branchA, f.therapist1, 8, 2), source: "PHONE", packageId: pkgId,
    }, "t"), "VALIDATION", /valid until/);
  });

  it("uses a session at check-in, not at booking", async () => {
    let k = (await getPackage(f.orgId, pkgId))!;
    expect(k).toMatchObject({ done: 0, upcoming: 2, expired: false });
    await go(sessions[0], "check_in");
    k = (await getPackage(f.orgId, pkgId))!;
    expect(k).toMatchObject({ done: 1, upcoming: 1 });
    await go(sessions[0], "start");
    await go(sessions[0], "complete");
    expect((await getPackage(f.orgId, pkgId))!.done).toBe(1);
  });

  it("blocks check-in once expired, and allows it again after extending (with a reason)", async () => {
    await getPool().query(`UPDATE patient_package SET valid_until = (now() AT TIME ZONE 'Asia/Kolkata')::date - 1 WHERE id=$1`, [pkgId]);
    const k = (await getPackage(f.orgId, pkgId))!;
    expect(k.expired).toBe(true);
    expect((await listPackages(f.orgId, { view: "active" })).some((x) => x.id === pkgId)).toBe(false);
    expect((await listPackages(f.orgId, { view: "finished" })).some((x) => x.id === pkgId)).toBe(true);
    await expectCode(go(sessions[1], "check_in"), "INVALID_TRANSITION", /expired/);
    await expectCode(setPackageValidity(f.receptionist, { packageId: pkgId, validUntil: today, reason: "" }, "t"), "VALIDATION");
    // Can't move the expiry before a booked session.
    await expectCode(setPackageValidity(f.receptionist, { packageId: pkgId, validUntil: today, reason: "shorten" }, "t"), "VALIDATION", /booked on/);
    await expectCode(setPackageValidity(f.physio, { packageId: pkgId, validUntil: null, reason: "x" }, "t"), "FORBIDDEN");
    await setPackageValidity(f.receptionist, { packageId: pkgId, validUntil: null, reason: "Patient was unwell" }, "t");
    await go(sessions[1], "check_in");
    const audit = await q1<{ reason: string }>(`SELECT reason FROM audit_event WHERE action='package.validity' AND target_id=$1`, [pkgId]);
    expect(audit?.reason).toBe("Patient was unwell");
  });

  it("refuses check-in on a closed package and when every session is used", async () => {
    const p = await newPatient("Closed Package");
    const r = await createPackageBooking(f.receptionist, {
      patientId: p, serviceId: f.sessionSvc, therapistId: f.therapist2, startsAt: await futureSlot(f, f.branchA, f.therapist2, 1, 4),
      source: "PHONE", name: "1-day", sessions: 1, validDays: 7,
    }, "t");
    const [a] = (await q<{ id: string }>(`SELECT id FROM appointment WHERE package_id=$1`, [r.packageId])).map((x) => x.id);
    await getPool().query(`UPDATE patient_package SET status='CLOSED' WHERE id=$1`, [r.packageId]);
    await expectCode(go(a, "check_in"), "INVALID_TRANSITION", /closed package/);
    await getPool().query(`UPDATE patient_package SET status='ACTIVE' WHERE id=$1`, [r.packageId]);
    await go(a, "check_in");
    // A second visit squeezed in directly (bypassing the booking cap) still can't be checked in.
    const extra = await createStaffBooking(f.receptionist, { patientId: p, serviceId: f.sessionSvc, therapistId: f.therapist2, startsAt: await futureSlot(f, f.branchA, f.therapist2, 2, 4), source: "PHONE" }, "t");
    await getPool().query(`UPDATE appointment SET package_id=$2 WHERE id=$1`, [extra.appointmentId, r.packageId]);
    await expectCode(go(extra.appointmentId, "check_in"), "INVALID_TRANSITION", /have been used/);
  });

  it("leaves packages sold before this change without an expiry", async () => {
    const p = await newPatient("Old Package");
    const r = await createPackageBooking(f.receptionist, {
      patientId: p, serviceId: f.sessionSvc, therapistId: f.therapist1, startsAt: await futureSlot(f, f.branchA, f.therapist1, 3, 6),
      source: "PHONE", name: "legacy", sessions: 1, validDays: null,
    }, "t");
    expect(r.validUntil).toBeNull();
    expect((await getPackage(f.orgId, r.packageId))!.expired).toBe(false);
  });
});

// ───────────────────────── 2. Documents ─────────────────────────
describe("patient documents", () => {
  let patientId: string;
  let docId: string;

  beforeAll(async () => {
    patientId = await newPatient("Document Patient");
    // Asha treats this patient, so she is on the care team.
    await createStaffBooking(f.receptionist, { patientId, serviceId: f.sessionSvc, therapistId: f.therapist1, startsAt: await futureSlot(f, f.branchB, f.therapist1, 4, 1), source: "PHONE" }, "t");
  });

  it("lets reception upload but not open; checks the real file type and size", async () => {
    const up = (actor: StaffActor, bytes: Uint8Array, extra: Partial<Parameters<typeof uploadDocument>[1]> = {}) =>
      uploadDocument(actor, { patientId, kind: "MRI", title: "Lumbar MRI report", documentDate: today, fileName: "mri.pdf", bytes, ...extra }, "t");
    await expectCode(up(accountant, pdf()), "FORBIDDEN");
    await expectCode(up(f.receptionist, new TextEncoder().encode("<html><script>x</script>"), { fileName: "evil.pdf" }), "VALIDATION");
    await expectCode(up(f.receptionist, new Uint8Array(4 * 1024 * 1024 + 1).fill(0x25)), "VALIDATION");
    await expectCode(up(f.receptionist, pdf(), { kind: "SELFIE" }), "VALIDATION");
    const bytes = pdf();
    docId = (await up(f.receptionist, bytes, { fileName: 'MRI "scan"\r\n.PDF' })).documentId;
    await expectCode(up(asha, bytes), "DUPLICATE");
    const row = await q1<{ file_name: string; mime_type: string; size_bytes: number }>(`SELECT file_name, mime_type, size_bytes FROM patient_document WHERE id=$1`, [docId]);
    expect(row).toEqual({ file_name: "MRI-scan.pdf", mime_type: "application/pdf", size_bytes: bytes.byteLength });
    expect(await documentCount(f.receptionist, patientId)).toBe(1);
    await expectCode(listDocuments(f.receptionist, patientId), "FORBIDDEN");
    await expectCode(openDocument(f.receptionist, docId), "FORBIDDEN");
    await expectCode(openDocument(f.owner, docId), "FORBIDDEN");
  });

  it("opens for the care team and the clinical lead, logs each open, and hides from other physios", async () => {
    expect((await listDocuments(asha, patientId)).map((d) => d.title)).toEqual(["Lumbar MRI report"]);
    const file = await openDocument(asha, docId);
    expect(file.mimeType).toBe("application/pdf");
    expect(Buffer.from(file.content).toString("latin1").startsWith("%PDF-")).toBe(true);
    await expectCode(openDocument(ravi, docId), "FORBIDDEN");
    await openDocument(lead, docId);
    const views = await q<{ actor: string }>(`SELECT actor FROM audit_event WHERE action='clinical.document.view' AND target_id=$1`, [patientId]);
    expect(views.map((v) => v.actor).sort()).toEqual([asha.label, lead.label].sort());
    // The audit log never holds the title (it can name a diagnosis).
    const up = await q1<{ changes: string }>(`SELECT changes::text FROM audit_event WHERE action='clinical.document.upload' AND target_id=$1`, [patientId]);
    expect(up!.changes).not.toMatch(/Lumbar/);
  });

  it("removes with a reason (care team only); stored bytes can't be altered", async () => {
    await expectCode(deleteDocument(ravi, { documentId: docId, reason: "wrong" }, "t"), "FORBIDDEN");
    await expectCode(deleteDocument(asha, { documentId: docId, reason: "" }, "t"), "VALIDATION");
    await expect(getPool().query(`UPDATE patient_document_content SET content='x' WHERE document_id=$1`, [docId])).rejects.toThrow();
    await deleteDocument(asha, { documentId: docId, reason: "Wrong patient" }, "t");
    expect(await listDocuments(asha, patientId)).toEqual([]);
    await expectCode(openDocument(asha, docId), "NOT_FOUND");
    expect(await documentCount(f.receptionist, patientId)).toBe(0);
  });
});

// ───────────────────────── 4. Home exercise sheets ─────────────────────────
describe("home exercise sheets", () => {
  let patientId: string;
  let exId: string;

  beforeAll(async () => {
    patientId = await newPatient("Exercise Patient");
    await createStaffBooking(f.receptionist, { patientId, serviceId: f.sessionSvc, therapistId: f.therapist1, startsAt: await futureSlot(f, f.branchB, f.therapist1, 5, 1), source: "PHONE" }, "t");
  });

  it("keeps a clinic library that only clinicians can edit", async () => {
    await expectCode(saveExercise(f.receptionist, { name: "Quad sets", instructions: "Tighten thigh" }, "t"), "FORBIDDEN");
    exId = (await saveExercise(asha, { name: "Quad sets", bodyRegion: "Knee", instructions: "Tighten the thigh, press the knee down.", sets: 3, reps: 10, holdSeconds: 5 }, "t")).exerciseId;
    await expectCode(saveExercise(asha, { name: "quad SETS", instructions: "dup" }, "t"), "DUPLICATE");
  });

  it("issues a sheet from library and typed rows, snapshotting the text", async () => {
    await expectCode(createHomeProgramme(ravi, { patientId, title: "HEP", items: [{ exerciseId: exId }] }, "t"), "FORBIDDEN");
    await expectCode(createHomeProgramme(asha, { patientId, title: "HEP", items: [{}, {}] }, "t"), "VALIDATION");
    await expectCode(createHomeProgramme(asha, { patientId, title: "HEP", items: [{ name: "Bridge" }] }, "t"), "VALIDATION");
    await expectCode(createHomeProgramme(asha, { patientId, title: "HEP", items: [{ exerciseId: exId, timesPerDay: 99 }] }, "t"), "VALIDATION");
    const { programmeId } = await createHomeProgramme(asha, {
      patientId, title: "Knee programme", advice: "Ice after if sore.",
      items: [{ exerciseId: exId, timesPerDay: 2, daysPerWeek: 7 }, {}, { name: "Heel slides", instructions: "Slide the heel towards you.", reps: 15 }],
    }, "t");
    // Editing the library later does not change the sheet already given.
    await saveExercise(asha, { id: exId, name: "Quad sets", instructions: "CHANGED", sets: 1 }, "t");
    const sheet = await getHomeProgramme(asha, programmeId);
    expect(sheet.items).toHaveLength(2);
    expect(sheet.items[0]).toMatchObject({ position: 1, name: "Quad sets", sets: 3, reps: 10, hold_seconds: 5, times_per_day: 2, days_per_week: 7 });
    expect(sheet.items[0].instructions).toMatch(/press the knee/);
    expect(sheet.items[1]).toMatchObject({ position: 2, name: "Heel slides", reps: 15, sets: null });
    await expect(getPool().query(`UPDATE home_programme_item SET reps=1 WHERE programme_id=$1`, [programmeId])).rejects.toThrow();
    await expectCode(getHomeProgramme(f.receptionist, programmeId), "FORBIDDEN");
    await expectCode(getHomeProgramme(ravi, programmeId), "FORBIDDEN");
    expect((await getHomeProgramme(lead, programmeId)).title).toBe("Knee programme");

    await stopHomeProgramme(asha, { programmeId }, "t");
    expect((await listHomeProgrammes(asha, patientId))[0]).toMatchObject({ status: "STOPPED", items: 2 });
  });
});

// ───────────────────────── 5. Payment reminders ─────────────────────────
describe("payment reminders", () => {
  const sent: Record<string, unknown>[] = [];
  let withEmail: string;
  let noEmail: string;
  let withCredit: string;

  beforeAll(async () => {
    setMailTransportForTests({ sendMail: async (m) => { if (String(m.to).includes("bounce")) throw new Error("550 mailbox unavailable"); sent.push(m); } });
    withEmail = await newPatient("Reminder Patient", "pay.me@example.com");
    noEmail = await newPatient("No Email Patient");
    withCredit = await newPatient("Credit Patient", "credit@example.com");
    await issuedBill(withEmail, "1500");
    await issuedBill(withEmail, "500");
    await issuedBill(noEmail, "800");
    await issuedBill(withCredit, "700");
    await recordManualPayment(f.billing, { patientId: withCredit, method: "CASH", amountRupees: "200", receivedOn: today, receivingAccount: "Front desk", verifyNow: true }, "t");
  });

  it("lists who owes what and why some can't be reminded", async () => {
    await expectCode(sendPaymentReminder(f.physio, { patientId: withEmail }, "t"), "FORBIDDEN");
    const rows = await listOutstanding(f.receptionist);
    const mine = rows.find((r) => r.patient_id === withEmail)!;
    expect(mine).toMatchObject({ due_paise: "200000", bills: 2, email: "pay.me@example.com" });
    expect(rows.find((r) => r.patient_id === withCredit)!.credit_paise).toBe("20000");
    await expectCode(sendPaymentReminder(f.receptionist, { patientId: noEmail }, "t"), "VALIDATION", /No email/);
    await expectCode(sendPaymentReminder(f.receptionist, { patientId: withCredit }, "t"), "VALIDATION", /credit/);
  });

  it("emails bill numbers and amounts only, logs it, and won't repeat within 3 days", async () => {
    const r = await sendPaymentReminder(f.receptionist, { patientId: withEmail }, "t");
    expect(r).toEqual({ sentTo: "pay.me@example.com", amountPaise: "200000" });
    expect(sent).toHaveLength(1);
    expect(String(sent[0].subject)).toContain("2,000.00");
    expect(String(sent[0].text)).not.toMatch(/Session/); // no service / treatment names
    const log = await q1<{ status: string; invoice_ids: string[]; sent_by: string }>(`SELECT status, invoice_ids, sent_by FROM payment_reminder WHERE patient_id=$1`, [withEmail]);
    expect(log).toMatchObject({ status: "SENT", sent_by: f.receptionist.label });
    expect(log!.invoice_ids).toHaveLength(2);
    await expectCode(sendPaymentReminder(f.receptionist, { patientId: withEmail }, "t"), "VALIDATION", /3 days/);
  });

  it("records a failed send and reports it", async () => {
    const bounce = await newPatient("Bounce Patient", "bounce@example.com");
    await issuedBill(bounce, "300");
    await expectCode(sendPaymentReminder(f.receptionist, { patientId: bounce }, "t"), "VALIDATION", /could not be sent/);
    const log = await q1<{ status: string; error: string }>(`SELECT status, error FROM payment_reminder WHERE patient_id=$1`, [bounce]);
    expect(log).toMatchObject({ status: "FAILED" });
    expect(log!.error).toMatch(/550/);
  });

  it("sends to everyone who is ready in one go", async () => {
    const extra = await newPatient("Bulk Patient", "bulk@example.com");
    await issuedBill(extra, "100");
    const before = sent.length;
    const r = await sendAllPaymentReminders(f.owner, "t");
    // Ready: Bulk Patient, plus Bounce Patient (a failed send doesn't start the 3-day wait) which fails again.
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(1);
    expect(sent.length - before).toBe(1);
    expect(sent.at(-1)!.to).toBe("bulk@example.com");
  });
});
