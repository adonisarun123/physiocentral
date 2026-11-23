import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, q, q1 } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { addTimeOff } from "@/modules/clinic/team";
import { createPatient, updatePatient } from "@/modules/patients/admin";
import { createPackageBooking, createStaffBooking, setPackageStatus } from "@/modules/scheduling/staff-booking";
import { cancelAppointment, transitionAppointment } from "@/modules/scheduling/appointments";
import { getPackage, listPackages, packageSessions } from "@/modules/scheduling/packages";
import { buildFixture, futureSlot, resetDatabase, type Fixture } from "./helpers";

let f: Fixture;
let patientId: string;

async function expectCode(p: Promise<unknown>, code: string) {
  try { await p; } catch (e) {
    if (e instanceof DomainError) { expect(e.code).toBe(code); return; }
    throw e;
  }
  throw new Error(`expected DomainError ${code}, but the call succeeded`);
}
const localHM = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const localDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);

beforeAll(async () => {
  await resetDatabase();
  f = await buildFixture();
});
afterAll(async () => { await getPool().end(); });

describe("patient registration details", () => {
  it("stores age, sex and address at registration and on edit; diagnosis is clinical, not reception's", async () => {
    await expectCode(createPatient(f.receptionist, { fullName: "Lakshmi R", phone: "98450 22222", diagnosis: "Right knee OA" }, "t"), "FORBIDDEN");
    patientId = (await createPatient(f.receptionist, {
      fullName: "Lakshmi R", phone: "98450 22222", age: "54", sex: "female", address: "12 MG Road, Bengaluru",
    }, "t")).patientId;
    let p = await q1<{ age_years: number; age_recorded_on: string; sex: string; address: string; diagnosis: string | null }>(
      `SELECT age_years, to_char(age_recorded_on,'YYYY-MM-DD') age_recorded_on, sex, address, diagnosis FROM patient WHERE id=$1`, [patientId]);
    expect(p).toMatchObject({ age_years: 54, sex: "FEMALE", address: "12 MG Road, Bengaluru", diagnosis: null });
    expect(p!.age_recorded_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await updatePatient(f.receptionist, { patientId, fullName: "Lakshmi R", phone: "98450 22222", age: "", sex: "", address: "" }, "t");
    p = await q1(`SELECT age_years, age_recorded_on, sex, address, diagnosis FROM patient WHERE id=$1`, [patientId]);
    expect(p).toMatchObject({ age_years: null, age_recorded_on: null, sex: null, address: null, diagnosis: null });
  });

  it("rejects an impossible age or unknown sex; name + phone alone still work", async () => {
    await expectCode(createPatient(f.receptionist, { fullName: "X Y", phone: "98450 33333", age: "130" }, "t"), "VALIDATION");
    await expectCode(createPatient(f.receptionist, { fullName: "X Y", phone: "98450 33333", age: "4.5" }, "t"), "VALIDATION");
    await expectCode(createPatient(f.receptionist, { fullName: "X Y", phone: "98450 33333", sex: "unknown" }, "t"), "VALIDATION");
    await createPatient(f.receptionist, { fullName: "X Y", phone: "98450 33333" }, "t");
  });
});

describe("treatment packages", () => {
  let packageId: string;

  it("books a 7-day package: one session a day at the same time, same physiotherapist, not priced per visit", async () => {
    const start = await futureSlot(f, f.branchA, f.therapist1, 1, 4);
    const r = await createPackageBooking(f.receptionist, {
      patientId, serviceId: f.sessionSvc, therapistId: null, startsAt: start, source: "PHONE", name: "7-day package", sessions: 7, pricePaise: 530000,
    }, "t");
    packageId = r.packageId;
    expect(r).toMatchObject({ booked: 7, sessions: 7, skipped: [] });
    const rows = await q<{ starts_at: Date; status: string; therapist_id: string; quoted_price_paise: string | null }>(
      `SELECT starts_at, status, therapist_id, quoted_price_paise FROM appointment WHERE package_id=$1 ORDER BY starts_at`, [packageId]);
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((x) => localHM(new Date(x.starts_at)))).size).toBe(1);
    expect(new Set(rows.map((x) => x.therapist_id)).size).toBe(1);
    expect(rows.every((x) => x.status === "CONFIRMED" && x.quoted_price_paise === null)).toBe(true);
    const days = rows.map((x) => localDay(new Date(x.starts_at)));
    expect(new Set(days).size).toBe(7);
    const pk = await getPackage(f.orgId, packageId);
    expect(pk).toMatchObject({ sessions_total: 7, done: 0, upcoming: 7, price_paise: "530000" });
    expect((await listPackages(f.orgId)).map((k) => k.id)).toContain(packageId);
  });

  it("skips and reports a day the physiotherapist is off, and carries on to the next day", async () => {
    const p2 = (await createPatient(f.receptionist, { fullName: "Suresh B", phone: "98450 44444" }, "t")).patientId;
    const start = await futureSlot(f, f.branchA, f.therapist2, 12, 2);
    const day3 = new Date(new Date(start).getTime() + 2 * 86400_000);
    await addTimeOff(f.owner, { therapistId: f.therapist2, fromDate: localDay(day3), reason: "Leave" }, "t");
    const r = await createPackageBooking(f.receptionist, {
      patientId: p2, serviceId: f.sessionSvc, therapistId: f.therapist2, startsAt: start, source: "WALK_IN", name: "5-session package", sessions: 5,
    }, "t");
    expect(r.booked).toBe(5);
    expect(r.skipped).toEqual([localDay(day3)]);
    const days = (await packageSessions(r.packageId)).map((s) => localDay(new Date(s.starts_at)));
    expect(days).not.toContain(localDay(day3));
    expect(days).toHaveLength(5);
  });

  it("refuses a package whose first time is already taken (nothing is created)", async () => {
    const taken = (await packageSessions(packageId))[0];
    const t1 = (await q1<{ therapist_id: string }>(`SELECT therapist_id FROM appointment WHERE id=$1`, [taken.id]))!.therapist_id;
    const before = (await q1<{ n: number }>(`SELECT count(*)::int n FROM patient_package`))!.n;
    await expectCode(createPackageBooking(f.receptionist, {
      patientId, serviceId: f.sessionSvc, therapistId: t1, startsAt: new Date(taken.starts_at).toISOString(), source: "PHONE", name: "x pkg", sessions: 3,
    }, "t"), "SLOT_UNAVAILABLE");
    expect((await q1<{ n: number }>(`SELECT count(*)::int n FROM patient_package`))!.n).toBe(before);
  });

  it("completing a package visit creates no per-visit charge", async () => {
    const first = (await packageSessions(packageId))[0];
    for (const t of ["check_in", "start", "complete"] as const) {
      const v = (await q1<{ version: number }>(`SELECT version FROM appointment WHERE id=$1`, [first.id]))!.version;
      await transitionAppointment(f.receptionist, { appointmentId: first.id, expectedVersion: v, transition: t }, "t");
    }
    expect((await q1<{ n: number }>(`SELECT count(*)::int n FROM billable_charge WHERE appointment_id=$1`, [first.id]))!.n).toBe(0);
    expect(await getPackage(f.orgId, packageId)).toMatchObject({ done: 1, upcoming: 6 });
  });

  it("a full package takes no extra visit; cancelling one frees its place for a rebooking", async () => {
    const extra = await futureSlot(f, f.branchA, f.therapist2, 20, 0);
    await expectCode(createStaffBooking(f.receptionist, { patientId, serviceId: f.sessionSvc, therapistId: f.therapist2, startsAt: extra, source: "PHONE", packageId }, "t"), "VALIDATION");
    const last = (await packageSessions(packageId)).at(-1)!;
    await cancelAppointment(f.receptionist, { appointmentId: last.id, reason: "Patient travelling" }, "t");
    const r = await createStaffBooking(f.receptionist, { patientId, serviceId: f.sessionSvc, therapistId: f.therapist2, startsAt: extra, source: "PHONE", packageId }, "t");
    const a = await q1<{ package_id: string; quoted_price_paise: string | null }>(`SELECT package_id, quoted_price_paise FROM appointment WHERE id=$1`, [r.appointmentId]);
    expect(a).toEqual({ package_id: packageId, quoted_price_paise: null });
    expect(await getPackage(f.orgId, packageId)).toMatchObject({ done: 1, upcoming: 6 });
  });

  it("a closed package leaves the running list and takes no bookings; only booking staff can close it", async () => {
    await expectCode(setPackageStatus(f.physio, { packageId, status: "CLOSED" }, "t"), "FORBIDDEN");
    await setPackageStatus(f.receptionist, { packageId, status: "CLOSED" }, "t");
    expect((await listPackages(f.orgId)).map((k) => k.id)).not.toContain(packageId);
    expect((await listPackages(f.orgId, { view: "finished" })).map((k) => k.id)).toContain(packageId);
    const extra = await futureSlot(f, f.branchA, f.therapist1, 25, 0);
    await expectCode(createStaffBooking(f.receptionist, { patientId, serviceId: f.sessionSvc, startsAt: extra, source: "PHONE", packageId }, "t"), "VALIDATION");
  });
});
