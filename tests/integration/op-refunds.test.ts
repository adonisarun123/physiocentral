import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, q, q1 } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { formatOpNumber, parseOpNumber, patientNumber, todayInZone } from "@/lib/format";
import { createPatient, searchPatients } from "@/modules/patients/admin";
import { createBookingRequest } from "@/modules/scheduling/booking";
import { acceptAppointment, cancelAppointment, rejectAppointment } from "@/modules/scheduling/appointments";
import { createDirectInvoice, issueInvoice } from "@/modules/billing/invoices";
import { recordManualPayment } from "@/modules/payments/manual";
import { paymentDisplayStatus, refundPayment, reversePayment } from "@/modules/payments/refunds";
import { bookingPayload, buildFixture, ctx, futureSlot, resetDatabase, type Fixture } from "./helpers";

let f: Fixture;
const db = () => getPool();
const today = todayInZone();

async function expectCode(p: Promise<unknown>, code: string) {
  try { await p; } catch (e) {
    if (e instanceof DomainError) { expect(e.code).toBe(code); return; }
    throw e;
  }
  throw new Error(`expected DomainError ${code}, but the call succeeded`);
}
const op = async (patientId: string) => (await q1<{ op_number: number | null }>(`SELECT op_number FROM patient WHERE id=$1`, [patientId]))!.op_number;
const funds = async (paymentId: string) => (await q1<{ allocated_paise: string; unallocated_paise: string; refunded_paise: string }>(
  `SELECT allocated_paise::text, unallocated_paise::text, refunded_paise::text FROM payment_funds WHERE payment_id=$1`, [paymentId]))!;
const balance = async (invoiceId: string) => (await q1<{ net_liability_paise: string; net_allocated_paise: string; amount_due_paise: string; credited_paise: string }>(
  `SELECT net_liability_paise::text, net_allocated_paise::text, amount_due_paise::text, credited_paise::text FROM invoice_balance WHERE invoice_id=$1`, [invoiceId]))!;
const pay = (patientId: string, rupees: string, extra: Record<string, unknown> = {}) =>
  recordManualPayment(f.billing, { patientId, method: "CASH", amountRupees: rupees, receivedOn: today, receivingAccount: "Front desk", verifyNow: true, ...extra }, "t");
const refund = (actor: Fixture["owner"], paymentId: string, rupees: string, extra: Record<string, unknown> = {}) =>
  refundPayment(actor, { paymentId, amountRupees: rupees, method: "CASH", refundedOn: today, paidFrom: "Front desk", reason: "Appointment cancelled", ...extra }, "t");
async function issuedBill(patientId: string, rupees: string) {
  const { invoiceId } = await createDirectInvoice(f.receptionist, { patientId, lines: [{ description: "Session", unitPriceRupees: rupees }] }, "t");
  const v = (await q1<{ version: number }>(`SELECT version FROM invoice WHERE id=$1`, [invoiceId]))!;
  const issued = await issueInvoice(f.billing, { invoiceId, expectedVersion: v.version }, "t");
  return { invoiceId, number: issued.number };
}

beforeAll(async () => {
  await resetDatabase();
  f = await buildFixture();
});
afterAll(async () => { await getPool().end(); });

describe("OP number", () => {
  it("formats, parses and falls back to the old ref", () => {
    expect(formatOpNumber(27)).toBe("OP-0027");
    expect(formatOpNumber(12345)).toBe("OP-12345");
    expect(formatOpNumber(null)).toBeNull();
    expect(patientNumber({ op_number: null, public_ref: "PT-AAAA-BBBB" })).toBe("PT-AAAA-BBBB");
    for (const t of ["OP-0027", "op27", "Op 27", "27", "0027"]) expect(parseOpNumber(t)).toBe(27);
    for (const t of ["", "0", "OP-", "PT-QEMN-MWJ9", "9845860005", "Arun"]) expect(parseOpNumber(t)).toBeNull();
  });

  it("front-desk registrations are numbered 1, 2, 3 in order and can be found by OP number", async () => {
    const a = await createPatient(f.receptionist, { fullName: "First Patient", phone: "98000 00001" }, "t");
    const b = await createPatient(f.receptionist, { fullName: "Second Patient", phone: "98000 00002" }, "t");
    expect(await op(a.patientId)).toBe(1);
    expect(await op(b.patientId)).toBe(2);
    for (const term of ["OP-0002", "op 2", "2"]) {
      const hits = await searchPatients(f.orgId, term);
      expect(hits[0]).toMatchObject({ id: b.patientId, op_number: 2 });
    }
    // The old random ref still finds the patient (it is printed on earlier receipts).
    const ref = (await q1<{ public_ref: string }>(`SELECT public_ref FROM patient WHERE id=$1`, [a.patientId]))!.public_ref;
    expect((await searchPatients(f.orgId, ref)).map((h) => h.id)).toEqual([a.patientId]);
  });

  it("an online request gets no number until it is confirmed; a rejected one never does", async () => {
    const start1 = await futureSlot(f, f.branchA, f.therapist1, 1);
    const r1 = await createBookingRequest(bookingPayload(f, { startsAt: start1, therapistId: f.therapist1 }), ctx);
    const a1 = (await q1<{ id: string; version: number; patient_id: string }>(`SELECT id, version, patient_id FROM appointment WHERE public_ref=$1`, [r1.reference]))!;
    expect(await op(a1.patient_id)).toBeNull();
    await rejectAppointment(f.receptionist, { appointmentId: a1.id, expectedVersion: a1.version, patientMessage: "Sorry, not available" }, "t");
    expect(await op(a1.patient_id)).toBeNull();

    const start2 = await futureSlot(f, f.branchA, f.therapist1, 2);
    const r2 = await createBookingRequest(bookingPayload(f, { startsAt: start2, therapistId: f.therapist1 }), ctx);
    const a2 = (await q1<{ id: string; version: number; patient_id: string }>(`SELECT id, version, patient_id FROM appointment WHERE public_ref=$1`, [r2.reference]))!;
    await acceptAppointment(f.receptionist, { appointmentId: a2.id, expectedVersion: a2.version }, "t");
    expect(await op(a2.patient_id)).toBe(3); // next after the two front-desk patients; the rejected request used nothing
    // Later activity never changes it.
    await pay(a2.patient_id, "100");
    expect(await op(a2.patient_id)).toBe(3);
  });

  it("numbers are unique per clinic and concurrent registrations never collide", async () => {
    const made = await Promise.all(Array.from({ length: 8 }, (_, i) => createPatient(f.receptionist, { fullName: `Rush ${i}`, phone: `97000 0000${i}` }, "t")));
    const nums = await Promise.all(made.map((m) => op(m.patientId)));
    expect(new Set(nums).size).toBe(8);
    expect(Math.min(...(nums as number[]))).toBe(4);
    expect(Math.max(...(nums as number[]))).toBe(11);
    await expect(db().query(`UPDATE patient SET op_number=1 WHERE id=$1`, [made[0].patientId])).rejects.toMatchObject({ code: "23505" });
  });

  it("new receipts print the OP number", async () => {
    const p = await createPatient(f.receptionist, { fullName: "Receipt Person", phone: "98000 00012" }, "t");
    const r = await pay(p.patientId, "250");
    const snap = (await q1<{ snapshot: { patientRef: string } }>(`SELECT snapshot FROM receipt WHERE payment_id=$1`, [r.paymentId]))!.snapshot;
    expect(snap.patientRef).toBe(formatOpNumber(await op(p.patientId)));
  });
});

describe("refunds", () => {
  let patientId: string;
  beforeAll(async () => { patientId = (await createPatient(f.receptionist, { fullName: "Refund Person", phone: "98111 00001" }, "t")).patientId; });

  it("the clinic's case: advance paid, appointment cancelled, full refund by the front desk, approver logged", async () => {
    const start = await futureSlot(f, f.branchA, f.therapist2, 1);
    const req = await createBookingRequest(bookingPayload(f, { startsAt: start, therapistId: f.therapist2 }), ctx);
    const appt = (await q1<{ id: string; version: number; patient_id: string }>(`SELECT id, version, patient_id FROM appointment WHERE public_ref=$1`, [req.reference]))!;
    const p = await pay(appt.patient_id, "400");
    await cancelAppointment(f.receptionist, { appointmentId: appt.id, reason: "Patient cannot come" }, "t");
    // Cancelling moves no money.
    expect(await funds(p.paymentId)).toEqual({ allocated_paise: "0", unallocated_paise: "40000", refunded_paise: "0" });

    const r = await refund(f.receptionist, p.paymentId, "400", { appointmentId: appt.id });
    expect(r.number).toMatch(/^RFD\/\d{4}-\d{2}\/000001$/);
    expect(r.fullyRefunded).toBe(true);
    expect(await funds(p.paymentId)).toEqual({ allocated_paise: "0", unallocated_paise: "0", refunded_paise: "40000" });
    const row = (await q1<{ approved_by: string; approved_by_name: string; appointment_id: string; amount_paise: string; snapshot: { approvedBy: string; patientRef: string } }>(
      `SELECT approved_by, approved_by_name, appointment_id, amount_paise::text, snapshot FROM payment_refund WHERE id=$1`, [r.refundId]))!;
    expect(row).toMatchObject({ approved_by: f.receptionist.label, approved_by_name: "RECEPTIONIST", appointment_id: appt.id, amount_paise: "40000" });
    expect(row.snapshot.approvedBy).toBe("RECEPTIONIST");
    // The original payment is untouched and still reads as verified in the ledger.
    const pm = (await q1<{ status: string; amount_paise: string }>(`SELECT status, amount_paise::text FROM payment WHERE id=$1`, [p.paymentId]))!;
    expect(pm).toEqual({ status: "VERIFIED", amount_paise: "40000" });
    expect(paymentDisplayStatus(pm.status, pm.amount_paise, "40000")).toBe("REFUNDED");
    const log = await q<{ actor: string; reason: string }>(`SELECT actor, reason FROM audit_event WHERE action='payment.refund' AND target_id=$1`, [p.paymentId]);
    expect(log).toEqual([{ actor: f.receptionist.label, reason: "Appointment cancelled" }]);
    await expectCode(refund(f.owner, p.paymentId, "1"), "INSUFFICIENT_FUNDS"); // nothing left
  });

  it("partial refunds add up and can never exceed what was paid", async () => {
    const p = await pay(patientId, "1000");
    await refund(f.owner, p.paymentId, "300");
    expect(paymentDisplayStatus("VERIFIED", "100000", "30000")).toBe("PART_REFUNDED");
    await expectCode(refund(f.owner, p.paymentId, "700.01"), "INSUFFICIENT_FUNDS");
    await refund(f.receptionist, p.paymentId, "700");
    expect(await funds(p.paymentId)).toEqual({ allocated_paise: "0", unallocated_paise: "0", refunded_paise: "100000" });
    const who = await q<{ approved_by_name: string }>(`SELECT approved_by_name FROM payment_refund WHERE payment_id=$1 ORDER BY created_at`, [p.paymentId]);
    expect(who.map((w) => w.approved_by_name)).toEqual(["OWNER", "RECEPTIONIST"]);
  });

  it("two refunds at the same moment cannot both go through", async () => {
    const p = await pay(patientId, "500");
    const results = await Promise.allSettled([refund(f.owner, p.paymentId, "400"), refund(f.receptionist, p.paymentId, "400")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await funds(p.paymentId)).refunded_paise).toBe("40000");
  });

  it("validation and permissions", async () => {
    const p = await pay(patientId, "500");
    await expectCode(refund(f.physio, p.paymentId, "100"), "FORBIDDEN");
    await expectCode(refund(f.owner, p.paymentId, "0"), "VALIDATION");
    await expectCode(refund(f.owner, p.paymentId, "abc"), "VALIDATION");
    await expectCode(refund(f.owner, p.paymentId, "100", { reason: "" }), "VALIDATION");
    await expectCode(refund(f.owner, p.paymentId, "100", { method: "UPI_MANUAL" }), "VALIDATION"); // UTR needed
    await expectCode(refund(f.owner, p.paymentId, "100", { refundedOn: "2099-01-01" }), "VALIDATION");
    await expectCode(refund(f.owner, p.paymentId, "100", { refundedOn: "2020-01-01" }), "VALIDATION");
    const pending = await recordManualPayment(f.receptionist, { patientId, method: "CASH", amountRupees: "200", receivedOn: today, receivingAccount: "Front desk" }, "t");
    await expectCode(refund(f.owner, pending.paymentId, "100"), "INVALID_TRANSITION");
    // Someone else's appointment cannot be attached.
    const other = await createPatient(f.receptionist, { fullName: "Other Person", phone: "98111 00009" }, "t");
    const start = await futureSlot(f, f.branchB, f.therapist2, 3);
    const req = await createBookingRequest(bookingPayload(f, { branchId: f.branchB, startsAt: start, therapistId: f.therapist2 }), ctx);
    const appt = (await q1<{ id: string }>(`SELECT id FROM appointment WHERE public_ref=$1`, [req.reference]))!;
    expect(other.patientId).toBeTruthy();
    await expectCode(refund(f.owner, p.paymentId, "100", { appointmentId: appt.id }), "NOT_FOUND");
    expect((await funds(p.paymentId)).refunded_paise).toBe("0");
  });

  it("refunds are append-only and guarded in the database itself", async () => {
    const p = await pay(patientId, "300");
    const r = await refund(f.owner, p.paymentId, "100");
    await expect(db().query(`UPDATE payment_refund SET amount_paise=1 WHERE id=$1`, [r.refundId])).rejects.toMatchObject({ code: "P0001" });
    await expect(db().query(`DELETE FROM payment_refund WHERE id=$1`, [r.refundId])).rejects.toMatchObject({ code: "P0001" });
    await expect(db().query(
      `INSERT INTO payment_refund (organization_id, payment_id, patient_id, amount_paise, method, refunded_on, paid_from, reason, approved_by, approved_by_name, financial_year, number, snapshot)
       VALUES ($1,$2,$3,25000,'CASH',current_date,'x','direct insert','staff:x','x','2026-27','RFD/x/1','{}')`, [f.orgId, p.paymentId, patientId])).rejects.toMatchObject({ code: "P0005" });
  });

  it("refunding a payment that is on a bill: with a credit note the bill shows nothing due", async () => {
    const bill = await issuedBill(patientId, "400");
    const p = await pay(patientId, "400", { intendedInvoiceId: bill.invoiceId });
    expect(await balance(bill.invoiceId)).toMatchObject({ amount_due_paise: "0", net_allocated_paise: "40000" });
    const r = await refund(f.receptionist, p.paymentId, "400");
    expect(r.releasedFrom).toEqual([bill.number]);
    expect(r.creditNotes).toHaveLength(1);
    expect(r.creditNotes[0]).toMatch(/^CN\//);
    expect(await balance(bill.invoiceId)).toEqual({ net_liability_paise: "0", net_allocated_paise: "0", amount_due_paise: "0", credited_paise: "40000" });
    expect(await funds(p.paymentId)).toEqual({ allocated_paise: "0", unallocated_paise: "0", refunded_paise: "40000" });
    // The issued bill itself is not rewritten.
    expect((await q1<{ status: string; total_paise: string }>(`SELECT status, total_paise::text FROM invoice WHERE id=$1`, [bill.invoiceId]))).toEqual({ status: "ISSUED", total_paise: "40000" });
    await expect(db().query(`DELETE FROM credit_note WHERE invoice_id=$1`, [bill.invoiceId])).rejects.toMatchObject({ code: "P0001" });
  });

  it("package case: part refund of a billed payment reduces the bill by the same amount", async () => {
    const bill = await issuedBill(patientId, "4900");
    const p = await pay(patientId, "4900", { intendedInvoiceId: bill.invoiceId });
    await refund(f.owner, p.paymentId, "2940", { reason: "Package stopped after 4 of 10 sessions" });
    expect(await balance(bill.invoiceId)).toEqual({ net_liability_paise: "196000", net_allocated_paise: "196000", amount_due_paise: "0", credited_paise: "294000" });
    expect(await funds(p.paymentId)).toEqual({ allocated_paise: "196000", unallocated_paise: "0", refunded_paise: "294000" });
  });

  it("without the credit note the bill simply becomes unpaid again", async () => {
    const bill = await issuedBill(patientId, "600");
    const p = await pay(patientId, "600", { intendedInvoiceId: bill.invoiceId });
    const r = await refund(f.owner, p.paymentId, "600", { creditBills: false });
    expect(r.creditNotes).toEqual([]);
    expect(await balance(bill.invoiceId)).toMatchObject({ net_liability_paise: "60000", amount_due_paise: "60000", credited_paise: "0" });
  });

  it("unapplied credit is refunded first, before anything is taken off a bill", async () => {
    const bill = await issuedBill(patientId, "500");
    const p = await pay(patientId, "800", { intendedInvoiceId: bill.invoiceId }); // 500 on the bill, 300 credit
    expect(await funds(p.paymentId)).toMatchObject({ allocated_paise: "50000", unallocated_paise: "30000" });
    const r1 = await refund(f.owner, p.paymentId, "300");
    expect(r1.releasedFrom).toEqual([]);
    expect(await balance(bill.invoiceId)).toMatchObject({ amount_due_paise: "0", credited_paise: "0" });
    const r2 = await refund(f.owner, p.paymentId, "200");
    expect(r2.releasedFrom).toEqual([bill.number]);
    expect(await balance(bill.invoiceId)).toEqual({ net_liability_paise: "30000", net_allocated_paise: "30000", amount_due_paise: "0", credited_paise: "20000" });
  });
});

describe("reversing an entry made by mistake", () => {
  let patientId: string;
  beforeAll(async () => { patientId = (await createPatient(f.receptionist, { fullName: "Mistake Person", phone: "98222 00001" }, "t")).patientId; });

  it("marks the payment reversed, records who and why, and makes its bill unpaid again", async () => {
    const bill = await issuedBill(patientId, "700");
    const p = await pay(patientId, "700", { intendedInvoiceId: bill.invoiceId });
    await expectCode(reversePayment(f.receptionist, { paymentId: p.paymentId, reason: "Entered twice" }, "t"), "FORBIDDEN");
    await expectCode(reversePayment(f.billing, { paymentId: p.paymentId, reason: " " }, "t"), "VALIDATION");
    const r = await reversePayment(f.billing, { paymentId: p.paymentId, reason: "Entered twice" }, "t");
    expect(r.releasedFrom).toEqual([bill.number]);
    const pm = (await q1<{ status: string; reversed_by: string; reversal_reason: string }>(`SELECT status, reversed_by, reversal_reason FROM payment WHERE id=$1`, [p.paymentId]))!;
    expect(pm).toEqual({ status: "REVERSED", reversed_by: f.billing.label, reversal_reason: "Entered twice" });
    expect(await balance(bill.invoiceId)).toMatchObject({ amount_due_paise: "70000", net_allocated_paise: "0", credited_paise: "0" });
    await expectCode(reversePayment(f.billing, { paymentId: p.paymentId, reason: "again" }, "t"), "INVALID_TRANSITION");
    await expectCode(refund(f.owner, p.paymentId, "100"), "INVALID_TRANSITION");
  });

  it("a reversed UPI entry does not block re-entering the correct payment with the same UTR", async () => {
    const wrong = await pay(patientId, "5000", { method: "UPI_MANUAL", reference: "UTR-SAME-1", receivingAccount: "Clinic UPI" });
    await reversePayment(f.billing, { paymentId: wrong.paymentId, reason: "Wrong amount, should be 500" }, "t");
    const right = await pay(patientId, "500", { method: "UPI_MANUAL", reference: "UTR-SAME-1", receivingAccount: "Clinic UPI" });
    expect(right.receiptNumber).toBeTruthy();
  });

  it("a payment with a refund on it cannot be reversed", async () => {
    const p = await pay(patientId, "300");
    await refund(f.owner, p.paymentId, "100");
    await expectCode(reversePayment(f.billing, { paymentId: p.paymentId, reason: "Mistake" }, "t"), "INVALID_TRANSITION");
    await expect(db().query(`UPDATE payment SET status='REVERSED', reversed_by='x', reversed_at=now(), reversal_reason='x' WHERE id=$1`, [p.paymentId])).rejects.toMatchObject({ code: "P0005" });
  });
});

describe("online request from someone already registered", () => {
  it("staff can put the request on the existing record: one patient, one OP number", async () => {
    const { attachRequestToPatient, existingPatientMatches } = await import("@/modules/patients/admin");
    const known = await createPatient(f.receptionist, { fullName: "Returning Person", phone: "98333 00001" }, "t");
    const knownOp = await op(known.patientId);
    const start = await futureSlot(f, f.branchB, f.therapist1, 4);
    const req = await createBookingRequest(bookingPayload(f, { branchId: f.branchB, startsAt: start, therapistId: f.therapist1, fullName: "Returning P", phone: "98333 00001" }), ctx);
    const appt = (await q1<{ id: string; version: number; patient_id: string }>(`SELECT id, version, patient_id FROM appointment WHERE public_ref=$1`, [req.reference]))!;
    expect(appt.patient_id).not.toBe(known.patientId);

    const matches = await existingPatientMatches(f.orgId, [appt.patient_id]);
    expect(matches).toEqual([expect.objectContaining({ request_patient_id: appt.patient_id, id: known.patientId, op_number: knownOp })]);

    await expectCode(attachRequestToPatient(f.physio, { appointmentId: appt.id, expectedVersion: appt.version, patientId: known.patientId }, "t"), "FORBIDDEN");
    await expectCode(attachRequestToPatient(f.receptionist, { appointmentId: appt.id, expectedVersion: appt.version + 5, patientId: known.patientId }, "t"), "STALE_VERSION");
    const r = await attachRequestToPatient(f.receptionist, { appointmentId: appt.id, expectedVersion: appt.version, patientId: known.patientId }, "t");
    expect(r.patientNumber).toBe(formatOpNumber(knownOp));

    const after = (await q1<{ patient_id: string; version: number; status: string }>(`SELECT patient_id, version, status FROM appointment WHERE id=$1`, [appt.id]))!;
    expect(after).toEqual({ patient_id: known.patientId, version: appt.version + 1, status: "REQUESTED" });
    expect((await q1<{ archived: boolean; op_number: number | null }>(`SELECT archived, op_number FROM patient WHERE id=$1`, [appt.patient_id]))).toEqual({ archived: true, op_number: null });
    expect((await q1<{ n: string }>(`SELECT count(*)::text n FROM consent_record WHERE patient_id=$1`, [known.patientId]))!.n).toBe("3");
    // Accepting now confirms the visit for the existing patient; no new OP number is used.
    const before = (await q1<{ next_value: number }>(`SELECT next_value FROM patient_op_sequence WHERE organization_id=$1`, [f.orgId]))!.next_value;
    await acceptAppointment(f.receptionist, { appointmentId: appt.id, expectedVersion: after.version }, "t");
    expect(await op(known.patientId)).toBe(knownOp);
    expect((await q1<{ next_value: number }>(`SELECT next_value FROM patient_op_sequence WHERE organization_id=$1`, [f.orgId]))!.next_value).toBe(before);
    // Once confirmed it can no longer be moved.
    const conf = (await q1<{ version: number }>(`SELECT version FROM appointment WHERE id=$1`, [appt.id]))!;
    const other = await createPatient(f.receptionist, { fullName: "Someone Else", phone: "98333 00002" }, "t");
    await expectCode(attachRequestToPatient(f.receptionist, { appointmentId: appt.id, expectedVersion: conf.version, patientId: other.patientId }, "t"), "INVALID_TRANSITION");
  });
});
