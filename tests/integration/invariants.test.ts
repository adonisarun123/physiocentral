import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, q1 } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { createBookingRequest } from "@/modules/scheduling/booking";
import { acceptAppointment, cancelAppointment, transitionAppointment } from "@/modules/scheduling/appointments";
import { findSlots } from "@/modules/scheduling/availability";
import { resolveManageToken } from "@/modules/scheduling/manage-link";
import { addEstimateLine, createEstimate, decideEstimate, markEstimateLinePerformed, reviseEstimate, sendEstimateVersion } from "@/modules/billing/estimates";
import { createDraftInvoice, discardDraftInvoice, issueInvoice } from "@/modules/billing/invoices";
import { allocatePayment, recordManualPayment, verifyPayment } from "@/modules/payments/manual";
import { addPriceVersion } from "@/modules/catalog/admin";
import { bookingPayload, buildFixture, ctx, futureSlot, resetDatabase, type Fixture } from "./helpers";

let f: Fixture;
const db = () => getPool();

async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    if (e instanceof DomainError) {
      expect(e.code).toBe(code);
      return;
    }
    throw e;
  }
  throw new Error(`expected DomainError ${code}, but the call succeeded`);
}

async function requestAt(startsAt: string, extra: Record<string, unknown> = {}) {
  return createBookingRequest(bookingPayload(f, { startsAt, ...extra }), ctx);
}
async function apptByRef(ref: string) {
  return (await q1<{ id: string; version: number; patient_id: string; status: string }>(`SELECT id, version, patient_id, status FROM appointment WHERE public_ref=$1`, [ref]))!;
}

/** Book → accept → check-in → start → complete; returns appointment + its auto-created session charge. */
async function completedVisit(day: number, therapist = f.therapist1) {
  const start = await futureSlot(f, f.branchA, therapist, day);
  const r = await requestAt(start, { therapistId: therapist });
  let a = await apptByRef(r.reference);
  await acceptAppointment(f.receptionist, { appointmentId: a.id, expectedVersion: a.version }, "t");
  for (const t of ["check_in", "start", "complete"] as const) {
    a = await apptByRef(r.reference);
    await transitionAppointment(f.physio, { appointmentId: a.id, expectedVersion: a.version, transition: t }, "t");
  }
  const charge = (await q1<{ id: string }>(`SELECT id FROM billable_charge WHERE appointment_id=$1`, [a.id]))!;
  return { appt: a, chargeId: charge.id, token: r.manageToken! };
}

beforeAll(async () => {
  await resetDatabase();
  f = await buildFixture();
});
afterAll(async () => {
  await getPool().end();
});

describe("booking requests", () => {
  it("UAT-01: creates a pending request with reference, never confirmed", async () => {
    const start = await futureSlot(f, f.branchA, f.therapist1, 0, 0);
    const r = await requestAt(start);
    expect(r.status).toBe("REQUESTED");
    expect(r.reference).toMatch(/^PC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(r.manageToken).toBeTruthy();
    const res = await q1<{ n: string }>(`SELECT count(*) n FROM resource_reservation rr JOIN appointment a ON a.id=rr.appointment_id WHERE a.public_ref=$1`, [r.reference]);
    expect(Number(res!.n)).toBe(0); // requests alone do not reserve capacity
    const tok = await q1<{ token_hash: string }>(`SELECT token_hash FROM manage_token mt JOIN appointment a ON a.id = mt.appointment_id WHERE a.public_ref=$1`, [r.reference]);
    expect(tok!.token_hash).not.toBe(r.manageToken); // only the hash is stored
    expect((await resolveManageToken(r.manageToken!))?.kind).toBe("patient_link");
  });

  it("UAT-02: same idempotency key + same payload returns the original; different payload conflicts", async () => {
    const start = await futureSlot(f, f.branchA, f.therapist1, 0, 1);
    const payload = bookingPayload(f, { startsAt: start });
    const first = await createBookingRequest(payload, ctx);
    const replay = await createBookingRequest(payload, ctx);
    expect(replay.reference).toBe(first.reference);
    expect(replay.replayed).toBe(true);
    expect(replay.manageToken).toBeUndefined();
    await expectCode(createBookingRequest({ ...payload, fullName: "Someone Else" }, ctx), "IDEMPOTENCY_CONFLICT");
    const n = await q1<{ n: string }>(`SELECT count(*) n FROM appointment WHERE public_ref=$1`, [first.reference]);
    expect(Number(n!.n)).toBe(1);
  });

  it("concurrent double submit with one key yields exactly one appointment", async () => {
    const start = await futureSlot(f, f.branchA, f.therapist1, 0, 2);
    const payload = bookingPayload(f, { startsAt: start });
    const results = await Promise.allSettled([createBookingRequest(payload, ctx), createBookingRequest(payload, ctx)]);
    const refs = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ reference: string }>).value.reference);
    expect(new Set(refs).size).toBe(1);
  });

  it("BOOK-02: rejects past or off-grid times and inactive services", async () => {
    await expectCode(requestAt(new Date(Date.now() - 3600_000).toISOString()), "SLOT_UNAVAILABLE");
    const start = new Date(await futureSlot(f, f.branchA, f.therapist1, 0, 0));
    start.setUTCMinutes(start.getUTCMinutes() + 7);
    await expectCode(requestAt(start.toISOString()), "SLOT_UNAVAILABLE");
    await expectCode(createBookingRequest(bookingPayload(f, { startsAt: new Date().toISOString(), phone: "123" }), ctx), "VALIDATION");
  });
});

describe("acceptance and capacity", () => {
  it("UAT-03: two admins accept overlapping requests — exactly one reservation succeeds", async () => {
    const start = await futureSlot(f, f.branchA, f.therapist1, 1);
    const r1 = await requestAt(start, { therapistId: f.therapist1 });
    const r2 = await requestAt(start, { therapistId: f.therapist1 }); // requests do not block each other
    const a1 = await apptByRef(r1.reference);
    const a2 = await apptByRef(r2.reference);
    const results = await Promise.allSettled([
      acceptAppointment(f.owner, { appointmentId: a1.id, expectedVersion: a1.version }, "t"),
      acceptAppointment(f.receptionist, { appointmentId: a2.id, expectedVersion: a2.version }, "t"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0].reason as DomainError).code).toBe("SLOT_UNAVAILABLE");
  });

  it("UAT-04: a therapist working at two branches cannot be double booked", async () => {
    const start = await futureSlot(f, f.branchA, f.therapist2, 2);
    const rA = await requestAt(start, { therapistId: f.therapist2, branchId: f.branchA });
    const rB = await requestAt(start, { therapistId: f.therapist2, branchId: f.branchB });
    const aA = await apptByRef(rA.reference);
    const aB = await apptByRef(rB.reference);
    await acceptAppointment(f.owner, { appointmentId: aA.id, expectedVersion: aA.version }, "t");
    await expectCode(acceptAppointment(f.owner, { appointmentId: aB.id, expectedVersion: aB.version }, "t"), "SLOT_UNAVAILABLE");
    // and the slot has disappeared from availability at the other branch
    const slots = await findSlots({ branchId: f.branchB, serviceId: f.sessionSvc, therapistId: f.therapist2, exactStart: start, enforceLeadTime: true });
    expect(slots).toHaveLength(0);
  });

  it("the exclusion constraint itself rejects overlapping active reservations", async () => {
    const appt = await q1<{ id: string }>(`SELECT id FROM appointment LIMIT 1`);
    const res = await q1<{ id: string }>(`SELECT resource_id AS id FROM therapist WHERE id=$1`, [f.therapist1]);
    await db().query(`INSERT INTO resource_reservation (resource_id, appointment_id, occupied_at, state) VALUES ($1,$2,tstzrange('2030-01-01 10:00Z','2030-01-01 11:00Z','[)'),'CONFIRMED')`, [res!.id, appt!.id]);
    await expect(
      db().query(`INSERT INTO resource_reservation (resource_id, appointment_id, occupied_at, state) VALUES ($1,$2,tstzrange('2030-01-01 10:59Z','2030-01-01 11:30Z','[)'),'CONFIRMED')`, [res!.id, appt!.id]),
    ).rejects.toMatchObject({ code: "23P01" });
    // half-open: back-to-back is allowed
    await db().query(`INSERT INTO resource_reservation (resource_id, appointment_id, occupied_at, state) VALUES ($1,$2,tstzrange('2030-01-01 11:00Z','2030-01-01 11:30Z','[)'),'CONFIRMED')`, [res!.id, appt!.id]);
  });

  it("UAT-05: changing time or a requested therapist requires a patient proposal", async () => {
    const start = await futureSlot(f, f.branchA, f.therapist1, 3, 0);
    const other = await futureSlot(f, f.branchA, f.therapist1, 3, 4);
    const r = await requestAt(start, { therapistId: f.therapist1 });
    const a = await apptByRef(r.reference);
    await expectCode(acceptAppointment(f.owner, { appointmentId: a.id, expectedVersion: a.version, startsAt: other }, "t"), "PROPOSAL_REQUIRED");
    await expectCode(acceptAppointment(f.owner, { appointmentId: a.id, expectedVersion: a.version, therapistId: f.therapist2 }, "t"), "PROPOSAL_REQUIRED");
  });

  it("stale writes are rejected (expectedVersion)", async () => {
    const start = await futureSlot(f, f.branchA, f.therapist1, 4);
    const a = await apptByRef((await requestAt(start)).reference);
    await expectCode(acceptAppointment(f.owner, { appointmentId: a.id, expectedVersion: a.version + 5 }, "t"), "STALE_VERSION");
  });

  it("cancellation releases capacity; the slot becomes bookable again", async () => {
    const start = await futureSlot(f, f.branchA, f.therapist2, 5);
    const r = await requestAt(start, { therapistId: f.therapist2 });
    let a = await apptByRef(r.reference);
    await acceptAppointment(f.owner, { appointmentId: a.id, expectedVersion: a.version }, "t");
    expect(await findSlots({ branchId: f.branchA, serviceId: f.sessionSvc, therapistId: f.therapist2, exactStart: start, enforceLeadTime: true })).toHaveLength(0);
    a = await apptByRef(r.reference);
    const link = await resolveManageToken(r.manageToken!);
    await cancelAppointment(link!, { appointmentId: a.id, reason: "Patient cannot attend" }, "t");
    expect(await findSlots({ branchId: f.branchA, serviceId: f.sessionSvc, therapistId: f.therapist2, exactStart: start, enforceLeadTime: true })).toHaveLength(1);
  });

  it("no-show is refused before the attendance threshold; transitions are controlled", async () => {
    const start = await futureSlot(f, f.branchA, f.therapist1, 6);
    let a = await apptByRef((await requestAt(start)).reference);
    await expectCode(transitionAppointment(f.physio, { appointmentId: a.id, expectedVersion: a.version, transition: "complete" }, "t"), "INVALID_TRANSITION");
    await acceptAppointment(f.owner, { appointmentId: a.id, expectedVersion: a.version }, "t");
    a = (await q1<{ id: string; version: number; patient_id: string; status: string }>(`SELECT id, version, patient_id, status FROM appointment WHERE id=$1`, [a.id]))!;
    await expectCode(transitionAppointment(f.owner, { appointmentId: a.id, expectedVersion: a.version, transition: "no_show" }, "t"), "INVALID_TRANSITION");
  });
});

describe("estimates and extra charges", () => {
  it("UAT-12/13: declined extras cannot be billed; a changed amount needs a new version and new approval", async () => {
    const { appt, token } = await completedVisit(7);
    const { versionId } = await createEstimate(f.owner, appt.id, "t");
    await addEstimateLine(f.owner, { versionId, serviceId: f.materialsSvc, quantity: "1", isExtra: true, reason: "Taping for support" }, "t");
    const { contentHash } = await sendEstimateVersion(f.owner, versionId, "t");
    const link = (await resolveManageToken(token))!;
    await decideEstimate(link, { versionId, decision: "DECLINED", contentHash, method: "SECURE_LINK" }, "t");
    const line = (await q1<{ id: string }>(`SELECT id FROM estimate_line WHERE estimate_version_id=$1`, [versionId]))!;
    await expectCode(markEstimateLinePerformed(f.physio, line.id, "t"), "INVALID_TRANSITION");

    // sent version is frozen at DB level
    await expect(db().query(`UPDATE estimate_line SET unit_price_paise = 1 WHERE id=$1`, [line.id])).rejects.toMatchObject({ code: "P0004" });

    const { versionId: v2 } = await reviseEstimate(f.owner, versionId, "t");
    await addEstimateLine(f.owner, { versionId: v2, serviceId: f.materialsSvc, quantity: "2", isExtra: true, reason: "Second application" }, "t");
    const sent2 = await sendEstimateVersion(f.owner, v2, "t");
    // the old hash cannot approve the new terms
    await expectCode(decideEstimate(link, { versionId: v2, decision: "ACCEPTED", contentHash: contentHash, method: "SECURE_LINK" }, "t"), "STALE_VERSION");
    // staff cannot "tick the box" without offline-approval permission + attestation
    await expectCode(decideEstimate(f.physio, { versionId: v2, decision: "ACCEPTED", contentHash: sent2.contentHash, method: "STAFF_RECORDED_IN_PERSON", attestation: "Patient said yes at the desk" }, "t"), "FORBIDDEN");
    await expectCode(decideEstimate(f.owner, { versionId: v2, decision: "ACCEPTED", contentHash: sent2.contentHash, method: "STAFF_RECORDED_IN_PERSON", attestation: "" }, "t"), "VALIDATION");
    await decideEstimate(link, { versionId: v2, decision: "ACCEPTED", contentHash: sent2.contentHash, method: "SECURE_LINK" }, "t");
    const lines = await db().query(`SELECT id FROM estimate_line WHERE estimate_version_id=$1`, [v2]);
    for (const l of lines.rows) await markEstimateLinePerformed(f.physio, l.id, "t");
    await expectCode(markEstimateLinePerformed(f.physio, lines.rows[0].id, "t"), "ALREADY_BILLED");
  });
});

describe("invoices and payments", () => {
  it("UAT-14/15: ₹1,200 bill → ₹500 leaves ₹700 due → ₹700 settles it; receipts and ledger reconcile", async () => {
    const { appt, chargeId, token } = await completedVisit(8);
    // approved ₹200 materials via estimate
    const { versionId } = await createEstimate(f.owner, appt.id, "t");
    await addEstimateLine(f.owner, { versionId, serviceId: f.materialsSvc, quantity: "1", isExtra: true, reason: "Support tape" }, "t");
    const { contentHash } = await sendEstimateVersion(f.owner, versionId, "t");
    await decideEstimate((await resolveManageToken(token))!, { versionId, decision: "ACCEPTED", contentHash, method: "SECURE_LINK" }, "t");
    const line = (await q1<{ id: string }>(`SELECT id FROM estimate_line WHERE estimate_version_id=$1`, [versionId]))!;
    const { chargeId: matCharge } = await markEstimateLinePerformed(f.physio, line.id, "t");

    const { invoiceId } = await createDraftInvoice(f.billing, { patientId: appt.patient_id, chargeIds: [chargeId, matCharge], appointmentId: appt.id }, "t");
    const draft = (await q1<{ version: number; total_paise: string }>(`SELECT version, total_paise FROM invoice WHERE id=$1`, [invoiceId]))!;
    expect(draft.total_paise).toBe("120000");
    const { number } = await issueInvoice(f.billing, { invoiceId, expectedVersion: draft.version }, "t");
    expect(number).toMatch(/^INV\/\d{4}-\d{2}\/\d{6}$/);

    const p1 = await recordManualPayment(f.billing, { patientId: appt.patient_id, method: "CASH", amountRupees: "500", receivedOn: "2026-11-03", receivingAccount: "Front desk drawer", verifyNow: true, intendedInvoiceId: invoiceId }, "t");
    expect(p1.receiptNumber).toMatch(/^RCT\//);
    let bal = (await q1<{ amount_due_paise: string; net_allocated_paise: string }>(`SELECT * FROM invoice_balance WHERE invoice_id=$1`, [invoiceId]))!;
    expect(bal.amount_due_paise).toBe("70000");

    const p2 = await recordManualPayment(f.receptionist, { patientId: appt.patient_id, method: "UPI_MANUAL", amountRupees: "700", receivedOn: "2026-11-03", receivingAccount: "Clinic UPI", reference: "UTR123456789" }, "t");
    expect(p2.receiptNumber).toBeNull(); // receptionist records PENDING only
    await expectCode(verifyPayment(f.receptionist, { paymentId: p2.paymentId }, "t"), "FORBIDDEN");
    await verifyPayment(f.billing, { paymentId: p2.paymentId, allocateToInvoiceId: invoiceId }, "t");
    await expectCode(verifyPayment(f.billing, { paymentId: p2.paymentId }, "t"), "INVALID_TRANSITION"); // no double verification
    bal = (await q1<{ amount_due_paise: string; net_allocated_paise: string }>(`SELECT * FROM invoice_balance WHERE invoice_id=$1`, [invoiceId]))!;
    expect(bal.amount_due_paise).toBe("0");
    expect(bal.net_allocated_paise).toBe("120000");
    const receipts = await q1<{ n: string; sum: string }>(
      `SELECT count(*) n, sum((snapshot->>'amountPaise')::bigint) sum FROM receipt WHERE payment_id = ANY($1::uuid[])`, [[p1.paymentId, p2.paymentId]]);
    expect(receipts).toMatchObject({ n: "2", sum: "120000" });

    // UAT-35: the issued original is unchanged by later payments
    const snap = (await q1<{ snapshot: { asOfIssue: { balanceDuePaise: string } } }>(`SELECT snapshot FROM invoice WHERE id=$1`, [invoiceId]))!;
    expect(snap.snapshot.asOfIssue.balanceDuePaise).toBe("120000");
  });

  it("UAT-16: overpayment stays explicit unallocated credit; over-allocation is refused", async () => {
    const { appt, chargeId } = await completedVisit(9);
    const { invoiceId } = await createDraftInvoice(f.billing, { patientId: appt.patient_id, chargeIds: [chargeId] }, "t");
    const v = (await q1<{ version: number }>(`SELECT version FROM invoice WHERE id=$1`, [invoiceId]))!;
    await issueInvoice(f.billing, { invoiceId, expectedVersion: v.version }, "t");
    const p = await recordManualPayment(f.billing, { patientId: appt.patient_id, method: "CASH", amountRupees: "1500", receivedOn: "2026-11-03", receivingAccount: "Drawer", verifyNow: true, intendedInvoiceId: invoiceId }, "t");
    const funds = (await q1<{ unallocated_paise: string }>(`SELECT unallocated_paise FROM payment_funds WHERE payment_id=$1`, [p.paymentId]))!;
    expect(funds.unallocated_paise).toBe("50000");
    await expectCode(allocatePayment(f.billing, { paymentId: p.paymentId, invoiceId, amountRupees: "1" }, "t"), "VALIDATION");
    // ledger rows are append-only
    await expect(db().query(`DELETE FROM payment_allocation WHERE payment_id=$1`, [p.paymentId])).rejects.toMatchObject({ code: "P0001" });
    await expect(db().query(`UPDATE payment SET amount_paise = 1 WHERE id=$1`, [p.paymentId])).rejects.toMatchObject({ code: "P0003" });
  });

  it("UAT-21: an issued invoice cannot be edited or deleted (DB trigger)", async () => {
    const inv = (await q1<{ id: string }>(`SELECT id FROM invoice WHERE status='ISSUED' LIMIT 1`))!;
    await expect(db().query(`UPDATE invoice SET total_paise = 1 WHERE id=$1`, [inv.id])).rejects.toMatchObject({ code: "P0002" });
    await expect(db().query(`DELETE FROM invoice WHERE id=$1`, [inv.id])).rejects.toMatchObject({ code: "P0002" });
    await expect(db().query(`UPDATE invoice_line SET total_paise = 1 WHERE invoice_id=$1`, [inv.id])).rejects.toMatchObject({ code: "P0002" });
    await expectCode(issueInvoice(f.billing, { invoiceId: inv.id, expectedVersion: 99 }, "t"), "INVALID_TRANSITION");
  });

  it("UAT-34: two drafts cannot claim the same performed charge; discarding releases the claim", async () => {
    const { appt, chargeId } = await completedVisit(10);
    const results = await Promise.allSettled([
      createDraftInvoice(f.billing, { patientId: appt.patient_id, chargeIds: [chargeId] }, "t"),
      createDraftInvoice(f.owner, { patientId: appt.patient_id, chargeIds: [chargeId] }, "t"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ invoiceId: string }>[];
    expect(ok).toHaveLength(1);
    expect(((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason as DomainError).code).toBe("ALREADY_BILLED");
    const v = (await q1<{ version: number }>(`SELECT version FROM invoice WHERE id=$1`, [ok[0].value.invoiceId]))!;
    await discardDraftInvoice(f.billing, ok[0].value.invoiceId, v.version, "t");
    await createDraftInvoice(f.billing, { patientId: appt.patient_id, chargeIds: [chargeId] }, "t");
  });

  it("UAT-22: concurrent issuance yields a unique, gap-free number series", async () => {
    const drafts: { id: string; version: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const { appt, chargeId } = await completedVisit(11 + i, i % 2 ? f.therapist1 : f.therapist2);
      const { invoiceId } = await createDraftInvoice(f.billing, { patientId: appt.patient_id, chargeIds: [chargeId] }, "t");
      drafts.push((await q1<{ id: string; version: number }>(`SELECT id, version FROM invoice WHERE id=$1`, [invoiceId]))!);
    }
    const out = await Promise.all(drafts.map((d) => issueInvoice(f.billing, { invoiceId: d.id, expectedVersion: d.version }, "t")));
    const nums = out.map((o) => Number(o.number.split("/")[2])).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(5);
    for (let i = 1; i < nums.length; i++) expect(nums[i] - nums[i - 1]).toBe(1);
  });

  it("UAT-11: a new catalog price leaves accepted estimates and issued invoices unchanged", async () => {
    const before = await db().query(`SELECT id, total_paise, snapshot FROM invoice WHERE status='ISSUED' ORDER BY id`);
    const est = await db().query(`SELECT id, total_paise, content_hash FROM estimate_version WHERE status='ACCEPTED' ORDER BY id`);
    await addPriceVersion(f.owner, { serviceId: f.sessionSvc, amountRupees: "1500" }, "t");
    const after = await db().query(`SELECT id, total_paise, snapshot FROM invoice WHERE status='ISSUED' ORDER BY id`);
    const est2 = await db().query(`SELECT id, total_paise, content_hash FROM estimate_version WHERE status='ACCEPTED' ORDER BY id`);
    expect(after.rows).toEqual(before.rows);
    expect(est2.rows).toEqual(est.rows);
    const cur = await q1<{ unit_price_paise: string }>(`SELECT unit_price_paise FROM service_price_version WHERE service_id=$1 AND valid_during @> now()`, [f.sessionSvc]);
    expect(cur!.unit_price_paise).toBe("150000");
  });

  it("UAT-23: receptionist cannot issue invoices, verify payments or allocate", async () => {
    const draft = await q1<{ id: string; version: number }>(`SELECT id, version FROM invoice WHERE status='DRAFT' LIMIT 1`);
    await expectCode(issueInvoice(f.receptionist, { invoiceId: draft!.id, expectedVersion: draft!.version }, "t"), "FORBIDDEN");
    await expectCode(allocatePayment(f.receptionist, { paymentId: draft!.id, invoiceId: draft!.id, amountRupees: "1" }, "t"), "FORBIDDEN");
    expect(f.owner.permissions.has("CLINICAL_NOTES_READ")).toBe(false); // owner ≠ clinical access by default
  });

  it("cross-organization access is non-disclosing", async () => {
    const other = { ...f.owner, organizationId: "00000000-0000-0000-0000-000000000001" };
    const a = (await q1<{ id: string; version: number }>(`SELECT id, version FROM appointment WHERE status='REQUESTED' LIMIT 1`))!;
    await expectCode(acceptAppointment(other, { appointmentId: a.id, expectedVersion: a.version }, "t"), "NOT_FOUND");
  });

  it("audit trail is append-only", async () => {
    await expect(db().query(`DELETE FROM audit_event`)).rejects.toMatchObject({ code: "P0001" });
    const n = await q1<{ n: string }>(`SELECT count(*) n FROM audit_event`);
    expect(Number(n!.n)).toBeGreaterThan(20);
  });
});
