import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, q1 } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { findSlots } from "@/modules/scheduling/availability";
import { addTimeOff, createTherapist, removeTimeOff, setTherapistActive, setTherapistHours, updateTherapistProfile } from "@/modules/clinic/team";
import { createService, updateServiceDetails } from "@/modules/catalog/admin";
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
