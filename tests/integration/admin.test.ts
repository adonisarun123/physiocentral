import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, q1 } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { findSlots } from "@/modules/scheduling/availability";
import { addTimeOff, createTherapist, removeTimeOff, setTherapistActive, setTherapistHours, updateTherapistProfile } from "@/modules/clinic/team";
import { createService, updateServiceDetails } from "@/modules/catalog/admin";
import { createPatient, searchPatients } from "@/modules/patients/admin";
import { createStaffBooking } from "@/modules/scheduling/staff-booking";
import { createDirectInvoice, issueInvoice } from "@/modules/billing/invoices";
import { recordManualPayment } from "@/modules/payments/manual";
import { setStaffActive, updateStaff, resetStaffPassword, tempPassword } from "@/modules/staff/admin";
import { permissionsFor } from "@/modules/auth/permissions";
import { buildFixture, resetDatabase, type Fixture } from "./helpers";

let f: Fixture;

async function expectCode(p: Promise<unknown>, code: string) {
  try { await p; } catch (e) {
    if (e instanceof DomainError) { expect(e.code).toBe(code); return; }
    throw e;
  }
  throw new Error(`expected DomainError ${code}, but the call succeeded`);
}

async function localDate(offsetDays: number) {
  return (await getPool().query(`SELECT to_char((now() AT TIME ZONE 'Asia/Kolkata')::date + $1::int, 'YYYY-MM-DD') d, EXTRACT(DOW FROM (now() AT TIME ZONE 'Asia/Kolkata')::date + $1::int)::int dow`, [offsetDays])).rows[0] as { d: string; dow: number };
}

beforeAll(async () => {
  await resetDatabase();
  f = await buildFixture();
});
afterAll(async () => { await getPool().end(); });

describe("team & schedule admin", () => {
  it("a new physiotherapist with a service and hours is immediately bookable, only within those hours", async () => {
    const day = await localDate(3);
    const { therapistId } = await createTherapist(f.owner, {
      displayName: "Meera K", designation: "Physiotherapist", serviceIds: [f.sessionSvc],
      shifts: [{ weekday: day.dow, start: "10:00", end: "12:00" }],
    }, "t");
    // Fixture branch A is the primary branch (created first).
    const slots = await findSlots({ branchId: f.branchA, serviceId: f.sessionSvc, therapistId, date: day.d, enforceLeadTime: true });
    expect(slots.length).toBeGreaterThan(0);
    const fmt = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
    expect(fmt(new Date(slots[0].starts_at))).toBe("10:00");
    expect(slots.every((s) => fmt(new Date(s.ends_at)) <= "12:00")).toBe(true);
    const t = await q1<{ public: boolean; credentials_verified: boolean }>(`SELECT public, credentials_verified FROM therapist WHERE id=$1`, [therapistId]);
    expect(t).toEqual({ public: false, credentials_verified: false });
  });

  it("refuses overlapping shifts and showing an unverified clinician publicly", async () => {
    await expectCode(createTherapist(f.owner, { displayName: "X Y", designation: "Physio", serviceIds: [], shifts: [
      { weekday: 1, start: "09:00", end: "13:00" }, { weekday: 1, start: "12:00", end: "14:00" }] }, "t"), "VALIDATION");
    await expectCode(updateTherapistProfile(f.owner, { therapistId: f.therapist1, displayName: "Asha", designation: "Physio", credentialsVerified: false, public: true }, "t"), "VALIDATION");
  });

  it("changing hours changes online slots", async () => {
    const day = await localDate(4);
    await setTherapistHours(f.owner, { therapistId: f.therapist2, shifts: [] }, "t");
    const none = await findSlots({ branchId: f.branchA, serviceId: f.sessionSvc, therapistId: f.therapist2, date: day.d, enforceLeadTime: true });
    expect(none.length).toBe(0);
  });

  it("a clinic holiday blocks every clinician; removing it reopens slots", async () => {
    const day = await localDate(5);
    const before = await findSlots({ branchId: f.branchA, serviceId: f.sessionSvc, date: day.d, enforceLeadTime: true });
    expect(before.length).toBeGreaterThan(0);
    await addTimeOff(f.owner, { therapistId: null, fromDate: day.d, reason: "Festival" }, "t");
    expect((await findSlots({ branchId: f.branchA, serviceId: f.sessionSvc, date: day.d, enforceLeadTime: true })).length).toBe(0);
    const ex = (await q1<{ id: string }>(`SELECT id FROM availability_exception WHERE reason='Festival'`))!;
    await removeTimeOff(f.owner, ex.id, "t");
    expect((await findSlots({ branchId: f.branchA, serviceId: f.sessionSvc, date: day.d, enforceLeadTime: true })).length).toBe(before.length);
  });

  it("part-day leave blocks only those hours for that clinician", async () => {
    const day = await localDate(6);
    await addTimeOff(f.owner, { therapistId: f.therapist1, fromDate: day.d, fromTime: "06:00", toTime: "14:00", reason: "Appointment" }, "t");
    const slots = await findSlots({ branchId: f.branchA, serviceId: f.sessionSvc, therapistId: f.therapist1, date: day.d, enforceLeadTime: true });
    const fmt = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
    expect(slots.length).toBeGreaterThan(0);
    expect(fmt(new Date(slots[0].starts_at)) >= "14:00").toBe(true);
  });

  it("a receptionist cannot manage the team", async () => {
    await expectCode(createTherapist(f.receptionist, { displayName: "Z Z", designation: "P", serviceIds: [], shifts: [] }, "t"), "FORBIDDEN");
  });

  it("deactivation is refused while the clinician has upcoming confirmed visits", async () => {
    await getPool().query(
      `INSERT INTO patient (organization_id, public_ref, full_name) VALUES ($1,'PT-DEACT','P') `, [f.orgId]);
    const p = (await q1<{ id: string }>(`SELECT id FROM patient WHERE public_ref='PT-DEACT'`))!;
    await getPool().query(
      `INSERT INTO appointment (organization_id, public_ref, patient_id, service_id, branch_id, mode, therapist_id, starts_at, ends_at, duration_minutes,
         status, source, policy_version, created_by)
       VALUES ($1,'PC-DEACT',$2,$3,$4,'CLINIC',$5, now() + interval '3 days', now() + interval '3 days 45 minutes', 45, 'CONFIRMED','PHONE','v','t')`,
      [f.orgId, p.id, f.sessionSvc, f.branchA, f.therapist1]);
    await expectCode(setTherapistActive(f.owner, { therapistId: f.therapist1, active: false }, "t"), "VALIDATION");
  });
});

describe("catalog admin", () => {
  it("a new service starts as a private draft with optional price and therapist links", async () => {
    const { serviceId } = await createService(f.owner, {
      name: "Vestibular rehab", durationMinutes: 45, billingUnit: "Session", priceRupees: "1500", allTherapists: true, conditions: ["Vertigo", " "],
    }, "t");
    const s = (await q1<{ status: string; public: boolean; bookable: boolean; conditions: string[] }>(`SELECT status, public, bookable, conditions FROM service WHERE id=$1`, [serviceId]))!;
    expect(s).toEqual({ status: "DRAFT", public: false, bookable: false, conditions: ["Vertigo"] });
    const price = await q1<{ unit_price_paise: string }>(`SELECT unit_price_paise FROM service_price_version WHERE service_id=$1`, [serviceId]);
    expect(price?.unit_price_paise).toBe("150000");
    const skills = await q1<{ n: number }>(`SELECT count(*)::int n FROM therapist_skill WHERE service_id=$1`, [serviceId]);
    expect(skills!.n).toBeGreaterThanOrEqual(2);
    await updateServiceDetails(f.owner, { serviceId, name: "Vestibular rehabilitation", durationMinutes: 60, billingUnit: "Session" }, "t");
    expect((await q1<{ name: string }>(`SELECT name FROM service WHERE id=$1`, [serviceId]))!.name).toBe("Vestibular rehabilitation");
  });

  it("only price-managers can set a price when adding", async () => {
    await expectCode(createService(f.receptionist, { name: "Something", durationMinutes: 30, billingUnit: "Session", allTherapists: false }, "t"), "FORBIDDEN");
  });
});

describe("front desk: patients, phone/walk-in booking, direct invoices, payments", () => {
  let patientId: string;

  it("registers a patient and refuses an accidental duplicate phone unless overridden", async () => {
    patientId = (await createPatient(f.receptionist, { fullName: "Kavya S", phone: "98450 11111" }, "t")).patientId;
    await expectCode(createPatient(f.receptionist, { fullName: "Kavya Sharma", phone: "+91 98450 11111" }, "t"), "DUPLICATE");
    await createPatient(f.receptionist, { fullName: "Kavya's mother", phone: "9845011111", allowDuplicate: true }, "t");
    const hits = await searchPatients(f.orgId, "11111");
    expect(hits.length).toBe(2);
  });

  it("staff booking confirms directly and the same slot cannot be booked twice for one clinician", async () => {
    const day = await localDate(9);
    const slots = await findSlots({ branchId: f.branchA, serviceId: f.sessionSvc, therapistId: f.therapist2, date: day.d, enforceLeadTime: false });
    // therapist2's hours were cleared earlier; restore via therapist1 instead
    const s1 = slots.length ? slots : await findSlots({ branchId: f.branchA, serviceId: f.sessionSvc, therapistId: f.therapist1, date: day.d, enforceLeadTime: false });
    const t = s1[0].therapist_id;
    const startsAt = new Date(s1[0].starts_at).toISOString();
    const r = await createStaffBooking(f.receptionist, { patientId, serviceId: f.sessionSvc, therapistId: t, startsAt, source: "WALK_IN" }, "t");
    const a = (await q1<{ status: string; source: string; therapist_id: string }>(`SELECT status, source, therapist_id FROM appointment WHERE id=$1`, [r.appointmentId]))!;
    expect(a).toEqual({ status: "CONFIRMED", source: "WALK_IN", therapist_id: t });
    await expectCode(createStaffBooking(f.receptionist, { patientId, serviceId: f.sessionSvc, therapistId: t, startsAt, source: "PHONE" }, "t"), "SLOT_UNAVAILABLE");
    const res = await q1<{ n: number }>(`SELECT count(*)::int n FROM resource_reservation WHERE appointment_id=$1 AND state='CONFIRMED'`, [r.appointmentId]);
    expect(res!.n).toBe(1);
  });

  it("a physiotherapist role cannot create bookings", async () => {
    await expectCode(createStaffBooking(f.physio, { patientId, serviceId: f.sessionSvc, startsAt: new Date().toISOString(), source: "PHONE" }, "t"), "FORBIDDEN");
  });

  it("direct invoice: catalog price, custom item, quantity and discount add up exactly; issue numbers it", async () => {
    const { invoiceId } = await createDirectInvoice(f.receptionist, { patientId, lines: [
      { serviceId: f.sessionSvc, quantity: "2" },                                   // 2 × ₹1,000
      { description: "Knee brace", unitPriceRupees: "850.50", discountRupees: "50.50" }, // ₹800
      { description: "", unitPriceRupees: "" },                                    // blank row ignored
    ] }, "t");
    const inv = (await q1<{ total_paise: string; status: string; appointment_id: string | null }>(`SELECT total_paise, status, appointment_id FROM invoice WHERE id=$1`, [invoiceId]))!;
    expect(inv).toEqual({ total_paise: "280000", status: "DRAFT", appointment_id: null });
    await expectCode(createDirectInvoice(f.receptionist, { patientId, lines: [{ description: "Tape", unitPriceRupees: "100", discountRupees: "200" }] }, "t"), "VALIDATION");
    await expectCode(createDirectInvoice(f.receptionist, { patientId, lines: [] }, "t"), "VALIDATION");
    const v = (await q1<{ version: number }>(`SELECT version FROM invoice WHERE id=$1`, [invoiceId]))!;
    const issued = await issueInvoice(f.billing, { invoiceId, expectedVersion: v.version }, "t");
    expect(issued.number).toMatch(/\d+$/);
    // Pay ₹1,000 against it from the standalone payment flow.
    await recordManualPayment(f.billing, { patientId, method: "CASH", amountRupees: "1000", receivedOn: "2026-11-03", receivingAccount: "Front desk", intendedInvoiceId: invoiceId, verifyNow: true }, "t");
    const bal = (await q1<{ amount_due_paise: string }>(`SELECT amount_due_paise::text FROM invoice_balance WHERE invoice_id=$1`, [invoiceId]))!;
    expect(bal.amount_due_paise).toBe("180000");
  });

  it("an advance payment with no invoice stays as unallocated credit", async () => {
    const r = await recordManualPayment(f.billing, { patientId, method: "UPI_MANUAL", amountRupees: "5000", reference: "UTR-ADV-1", receivedOn: "2026-11-03", receivingAccount: "Clinic UPI", verifyNow: true }, "t");
    const funds = (await q1<{ unallocated_paise: string }>(`SELECT unallocated_paise::text FROM payment_funds WHERE payment_id=$1`, [r.paymentId]))!;
    expect(funds.unallocated_paise).toBe("500000");
    expect(r.receiptNumber).toBeTruthy();
  });
});

describe("staff logins: lock-out guards", () => {
  it("temporary passwords meet the 12+ character policy", () => {
    const p = tempPassword();
    expect(p).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
  });

  it("the only owner cannot be demoted or deactivated, and cannot deactivate or reset themselves", async () => {
    const o = f.owner;
    await expectCode(updateStaff(o, { staffId: o.staffId, name: "Owner", roles: ["CLINIC_ADMIN"] }, "t"), "VALIDATION");
    await expectCode(setStaffActive(o, { staffId: o.staffId, active: false }, "t"), "VALIDATION");
    await expectCode(resetStaffPassword(o, o.staffId, "t"), "VALIDATION");
  });

  it("a clinic admin given staff management still cannot grant Owner", async () => {
    const admin = { ...f.receptionist, roles: ["CLINIC_ADMIN"], permissions: new Set([...permissionsFor(["CLINIC_ADMIN"]), "USERS_MANAGE" as const]) };
    await expectCode(updateStaff(admin, { staffId: f.billing.staffId, name: "B", roles: ["BILLING", "OWNER"] }, "t"), "FORBIDDEN");
    await expectCode(updateStaff(f.receptionist, { staffId: f.billing.staffId, name: "B", roles: ["BILLING"] }, "t"), "FORBIDDEN");
  });

  it("an owner can change another person's roles", async () => {
    await updateStaff(f.owner, { staffId: f.billing.staffId, name: "Billing person", roles: ["BILLING", "RECEPTIONIST"] }, "t");
    const r = await q1<{ roles: string[] }>(`SELECT array_agg(role ORDER BY role) roles FROM role_grant WHERE staff_member_id=$1`, [f.billing.staffId]);
    expect(r!.roles).toEqual(["BILLING", "RECEPTIONIST"]);
  });
});
