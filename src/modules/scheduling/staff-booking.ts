import { tx, q, q1, pgErrorCode, type Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit, enqueue } from "@/modules/audit";
import { assertPermission, type Actor, type StaffActor } from "@/modules/auth/actor";
import { publicRef } from "@/lib/security/tokens";
import { findSlots } from "./availability";
import { BOOKING_POLICY_VERSION } from "./booking";

type Source = "PHONE" | "WALK_IN";
interface Ctx {
  patientId: string;
  svc: { id: string; branch_id: string; timezone: string; duration_minutes: number; buffer_before_minutes: number; buffer_after_minutes: number };
  pricePaise: string | null;
}

/** Patient + active service at its primary branch, or a DomainError. */
async function loadContext(db: Db, actor: StaffActor, patientId: string, serviceId: string): Promise<Ctx> {
  const patient = await q1<{ id: string }>(`SELECT id FROM patient WHERE id=$1 AND organization_id=$2 AND NOT archived`, [patientId, actor.organizationId], db);
  if (!patient) throw new DomainError("NOT_FOUND", "Patient not found.");
  const svc = await q1<Ctx["svc"]>(
    `SELECT s.id, sb.branch_id, b.timezone, s.duration_minutes, s.buffer_before_minutes, s.buffer_after_minutes
       FROM service s JOIN service_branch sb ON sb.service_id=s.id JOIN branch b ON b.id=sb.branch_id
      WHERE s.id=$1 AND s.organization_id=$2 AND s.status='ACTIVE' ORDER BY b.public DESC, b.created_at LIMIT 1`,
    [serviceId, actor.organizationId], db);
  if (!svc) throw new DomainError("VALIDATION", "That service is not active at this clinic.");
  const price = await q1<{ unit_price_paise: string }>(
    `SELECT unit_price_paise FROM service_price_version WHERE service_id=$1 AND (branch_id=$2 OR branch_id IS NULL) AND valid_during @> now() ORDER BY branch_id NULLS LAST LIMIT 1`,
    [svc.id, svc.branch_id], db);
  return { patientId: patient.id, svc, pricePaise: price?.unit_price_paise ?? null };
}

/**
 * Books one CONFIRMED appointment at an exact start, or returns null if no
 * eligible clinician is free then. The reservation insert (exclusion
 * constraint) remains the final guard against double booking.
 */
async function bookOne(
  db: Db, actor: StaffActor, ctx: Ctx,
  o: { startsAt: string; therapistId: string | null; requestedTherapistId: string | null; source: Source; reason: string | null; packageId: string | null; enforceHorizon: boolean },
) {
  const slots = await findSlots({ branchId: ctx.svc.branch_id, serviceId: ctx.svc.id, therapistId: o.therapistId, exactStart: o.startsAt, enforceLeadTime: false, enforceHorizon: o.enforceHorizon }, db);
  if (!slots.length) return null;
  const chosen = slots[0];
  await q(`SELECT id FROM resource WHERE id=$1 FOR UPDATE`, [chosen.resource_id], db);
  await q(`UPDATE resource_reservation SET state='EXPIRED' WHERE resource_id=$1 AND state='HELD' AND expires_at <= now()`, [chosen.resource_id], db);
  const startsAt = new Date(chosen.starts_at);
  const endsAt = new Date(chosen.ends_at);
  const reference = publicRef("PC");
  const { svc } = ctx;
  const appt = (await q1<{ id: string }>(
    `INSERT INTO appointment (organization_id, public_ref, patient_id, service_id, branch_id, mode, requested_therapist_id, therapist_id,
       starts_at, ends_at, duration_minutes, buffer_before_minutes, buffer_after_minutes, status, source, contact_verified,
       reason_brief, quoted_price_paise, policy_version, created_by, package_id)
     VALUES ($1,$2,$3,$4,$5,'CLINIC',$6,$7,$8,$9,$10,$11,$12,'CONFIRMED',$13,true,$14,$15,$16,$17,$18) RETURNING id`,
    [actor.organizationId, reference, ctx.patientId, svc.id, svc.branch_id, o.requestedTherapistId, chosen.therapist_id,
     startsAt, endsAt, svc.duration_minutes, svc.buffer_before_minutes, svc.buffer_after_minutes, o.source,
     o.reason, o.packageId ? null : ctx.pricePaise, BOOKING_POLICY_VERSION, actor.label, o.packageId], db))!;
  await q(
    `INSERT INTO resource_reservation (resource_id, appointment_id, occupied_at, state)
     VALUES ($1,$2, tstzrange($3::timestamptz - make_interval(mins => $5), $4::timestamptz + make_interval(mins => $6), '[)'), 'CONFIRMED')`,
    [chosen.resource_id, appt.id, startsAt, endsAt, svc.buffer_before_minutes, svc.buffer_after_minutes], db);
  await q(`INSERT INTO appointment_status_event (appointment_id, from_status, to_status, actor, reason) VALUES ($1,NULL,'CONFIRMED',$2,$3)`,
    [appt.id, actor.label, `source=${o.source}${o.packageId ? " package" : ""}`], db);
  await enqueue(db, "appointment.confirmed", `appt.confirmed:${appt.id}:1`, { appointmentId: appt.id });
  return { appointmentId: appt.id, reference, therapistId: chosen.therapist_id, startsAt: startsAt.toISOString() };
}

/** Sessions of a package that still hold a place (anything not cancelled / rejected). Caps bookings, not usage. */
export async function packageSessionsUsed(db: Db, packageId: string) {
  const r = await q1<{ n: number }>(
    `SELECT count(*)::int n FROM appointment WHERE package_id=$1 AND status NOT IN ('CANCELLED','REJECTED')`, [packageId], db);
  return r?.n ?? 0;
}

/**
 * Phone / walk-in booking entered by staff. Unlike an online request, staff
 * have spoken to the patient, so it is CONFIRMED directly — but through the
 * same rules: the slot must be valid for the service, the clinician must work
 * then, and the reservation insert (exclusion constraint) is the final guard
 * against double booking. Lead time is not enforced for staff.
 * With `packageId`, the visit is added to that package (e.g. to replace a
 * cancelled day) and is not charged per visit.
 */
export async function createStaffBooking(
  actor: Actor,
  input: { patientId: string; serviceId: string; therapistId?: string | null; startsAt: string; source: Source; reason?: string; packageId?: string | null },
  correlationId: string,
) {
  assertPermission(actor, "APPOINTMENT_ACCEPT");
  if (Number.isNaN(new Date(input.startsAt).getTime())) throw new DomainError("VALIDATION", "Choose a time.");
  try {
    return await tx(async (db) => {
      const ctx = await loadContext(db, actor, input.patientId, input.serviceId);
      let packageId: string | null = null;
      if (input.packageId) {
        const pkg = await q1<{ id: string; sessions_total: number; status: string; valid_until: string | null; past_expiry: boolean }>(
          `SELECT id, sessions_total, status, to_char(valid_until,'YYYY-MM-DD') valid_until,
                  (valid_until IS NOT NULL AND ($4::timestamptz AT TIME ZONE $5)::date > valid_until) past_expiry
             FROM patient_package WHERE id=$1 AND organization_id=$2 AND patient_id=$3 FOR UPDATE`,
          [input.packageId, actor.organizationId, ctx.patientId, new Date(input.startsAt).toISOString(), ctx.svc.timezone], db);
        if (!pkg) throw new DomainError("NOT_FOUND", "Package not found for this patient.");
        if (pkg.status !== "ACTIVE") throw new DomainError("VALIDATION", "This package is closed.");
        if (pkg.past_expiry) throw new DomainError("VALIDATION", `This package is valid until ${pkg.valid_until}. Pick an earlier day, or extend the package first.`);
        if ((await packageSessionsUsed(db, pkg.id)) >= pkg.sessions_total) throw new DomainError("VALIDATION", "All sessions in this package are already booked.");
        packageId = pkg.id;
      }
      const r = await bookOne(db, actor, ctx, {
        startsAt: new Date(input.startsAt).toISOString(), therapistId: input.therapistId || null, requestedTherapistId: input.therapistId || null,
        source: input.source, reason: input.reason?.trim().slice(0, 500) || null, packageId, enforceHorizon: !packageId,
      });
      if (!r) throw new DomainError("SLOT_UNAVAILABLE", "That time is no longer free for an eligible physiotherapist. Pick another time.");
      await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "appointment.staff_book", targetType: "appointment", targetId: r.appointmentId, changes: { source: input.source, therapistId: r.therapistId, packageId }, correlationId });
      return r;
    });
  } catch (e) {
    if (pgErrorCode(e) === "23P01") throw new DomainError("SLOT_UNAVAILABLE", "Someone just booked that time. Pick another time.");
    throw e;
  }
}

export interface PackageBookingInput {
  patientId: string;
  serviceId: string;
  therapistId?: string | null;
  /** First session; later sessions are at the same local time on the following days. */
  startsAt: string;
  source: Source;
  reason?: string;
  name: string;
  sessions: number;
  pricePaise?: number | null;
  /** Days the package stays valid, counted from the first session's day. null/undefined = no expiry. */
  validDays?: number | null;
}

/**
 * Books a treatment package (e.g. "7-day package"): one session a day at the
 * same time, starting with the chosen slot. Days the clinic is closed are
 * passed over silently; days where nobody is free at that time (leave,
 * holiday, already booked) are skipped and reported, and booking carries on
 * to the next day. All in one transaction. With "Any available", the
 * physiotherapist from day one is kept whenever they are free.
 */
export async function createPackageBooking(actor: Actor, input: PackageBookingInput, correlationId: string) {
  assertPermission(actor, "APPOINTMENT_ACCEPT");
  const sessions = Math.trunc(Number(input.sessions));
  if (!Number.isFinite(sessions) || sessions < 1 || sessions > 60) throw new DomainError("VALIDATION", "Number of sessions must be between 1 and 60.");
  const name = input.name.trim().slice(0, 120) || `${sessions}-session package`;
  if (input.pricePaise != null && (!Number.isInteger(input.pricePaise) || input.pricePaise < 0)) throw new DomainError("VALIDATION", "Enter a valid package price.");
  if (Number.isNaN(new Date(input.startsAt).getTime())) throw new DomainError("VALIDATION", "Choose a time for the first session.");
  const validDays = input.validDays == null ? null : Math.trunc(Number(input.validDays));
  if (validDays !== null && (!Number.isFinite(validDays) || validDays < 1 || validDays > 365)) throw new DomainError("VALIDATION", "Validity must be between 1 and 365 days.");
  if (validDays !== null && validDays < sessions) throw new DomainError("VALIDATION", `A ${sessions}-session package needs at least ${sessions} days of validity.`);
  const maxDays = Math.min(sessions * 2 + 14, 120, validDays === null ? 120 : validDays - 1);
  try {
    return await tx(async (db) => {
      const ctx = await loadContext(db, actor, input.patientId, input.serviceId);
      const reason = input.reason?.trim().slice(0, 500) || null;
      const pkg = (await q1<{ id: string; public_ref: string; valid_until: string | null }>(
        `INSERT INTO patient_package (organization_id, patient_id, public_ref, name, sessions_total, price_paise, note, created_by, valid_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
                 CASE WHEN $9::int IS NULL THEN NULL ELSE ($10::timestamptz AT TIME ZONE $11)::date + ($9::int - 1) END)
         RETURNING id, public_ref, to_char(valid_until,'YYYY-MM-DD') valid_until`,
        [actor.organizationId, ctx.patientId, publicRef("PK"), name, sessions, input.pricePaise ?? null, reason, actor.label,
         validDays, new Date(input.startsAt).toISOString(), ctx.svc.timezone], db))!;

      // Candidate start instants: same local wall-clock time on each following day.
      const days = await q<{ starts_at: Date; local_day: string; weekday: number; open: boolean }>(
        `WITH f AS (SELECT ($1::timestamptz AT TIME ZONE $2) AS l)
         SELECT ((f.l::date + g) + f.l::time) AT TIME ZONE $2 AS starts_at,
                to_char(f.l::date + g, 'YYYY-MM-DD') AS local_day,
                EXTRACT(DOW FROM f.l::date + g)::int AS weekday,
                EXISTS (SELECT 1 FROM availability_rule ar WHERE ar.branch_id=$3 AND ar.weekday = EXTRACT(DOW FROM f.l::date + g)) AS open
           FROM f, generate_series(0, $4::int) g ORDER BY g`,
        [new Date(input.startsAt).toISOString(), ctx.svc.timezone, ctx.svc.branch_id, maxDays], db);

      const fixedTherapist = input.therapistId || null;
      let keepTherapist: string | null = fixedTherapist;
      const booked: { appointmentId: string; reference: string; startsAt: string; therapistId: string }[] = [];
      const skipped: string[] = [];
      for (const [i, d] of days.entries()) {
        if (booked.length >= sessions) break;
        if (i > 0 && !d.open) continue; // weekly closed day (e.g. Sunday): not worth reporting
        const base = { startsAt: new Date(d.starts_at).toISOString(), requestedTherapistId: fixedTherapist, source: input.source, reason, packageId: pkg.id, enforceHorizon: false };
        let r = await bookOne(db, actor, ctx, { ...base, therapistId: keepTherapist });
        if (!r && !fixedTherapist && keepTherapist) r = await bookOne(db, actor, ctx, { ...base, therapistId: null });
        if (!r) {
          if (i === 0) throw new DomainError("SLOT_UNAVAILABLE", "The first session's time is no longer free. Pick another time.");
          skipped.push(d.local_day);
          continue;
        }
        if (!fixedTherapist && !keepTherapist) keepTherapist = r.therapistId;
        booked.push(r);
      }
      await audit(db, {
        organizationId: actor.organizationId, actor: actor.label, action: "package.book", targetType: "patient_package", targetId: pkg.id,
        changes: { name, sessions, booked: booked.length, skipped, source: input.source, validUntil: pkg.valid_until }, correlationId,
      });
      return { packageId: pkg.id, reference: pkg.public_ref, booked: booked.length, sessions, skipped, validUntil: pkg.valid_until, firstAppointmentId: booked[0]?.appointmentId ?? null };
    });
  } catch (e) {
    if (pgErrorCode(e) === "23P01") throw new DomainError("SLOT_UNAVAILABLE", "Someone just booked one of those times. Try again.");
    throw e;
  }
}

/** Close (finish early / refund) or reopen a package. Future booked sessions are left for staff to cancel individually. */
export async function setPackageStatus(actor: Actor, input: { packageId: string; status: "ACTIVE" | "CLOSED" }, correlationId: string) {
  assertPermission(actor, "APPOINTMENT_ACCEPT");
  return tx(async (db) => {
    const pkg = await q1<{ id: string }>(`SELECT id FROM patient_package WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [input.packageId, actor.organizationId], db);
    if (!pkg) throw new DomainError("NOT_FOUND", "Package not found.");
    await q(`UPDATE patient_package SET status=$2, updated_at=now() WHERE id=$1`, [pkg.id, input.status], db);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: `package.${input.status === "CLOSED" ? "close" : "reopen"}`, targetType: "patient_package", targetId: pkg.id, correlationId });
  });
}

/**
 * Change a package's expiry date (extend it, or remove the expiry with null).
 * A reason is required and logged. The new date can't fall before a session
 * that is already booked; cancel or move that session first.
 */
export async function setPackageValidity(actor: Actor, input: { packageId: string; validUntil: string | null; reason: string }, correlationId: string) {
  assertPermission(actor, "APPOINTMENT_ACCEPT");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new DomainError("VALIDATION", "Give a reason for changing the validity.", { reason: "Required" });
  if (input.validUntil !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil) || Number.isNaN(Date.parse(`${input.validUntil}T00:00:00Z`)))) {
    throw new DomainError("VALIDATION", "Enter a valid date.", { validUntil: "Invalid date" });
  }
  if (!/^[0-9a-f-]{36}$/i.test(input.packageId)) throw new DomainError("NOT_FOUND", "Package not found.");
  return tx(async (db) => {
    const pkg = await q1<{ id: string; valid_until: string | null }>(
      `SELECT id, to_char(valid_until,'YYYY-MM-DD') valid_until FROM patient_package WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
      [input.packageId, actor.organizationId], db);
    if (!pkg) throw new DomainError("NOT_FOUND", "Package not found.");
    if (input.validUntil) {
      const later = await q1<{ day: string }>(
        `SELECT to_char((a.starts_at AT TIME ZONE b.timezone)::date,'YYYY-MM-DD') AS day
           FROM appointment a JOIN branch b ON b.id=a.branch_id
          WHERE a.package_id=$1 AND a.status IN ('CONFIRMED','CHECKED_IN','IN_PROGRESS')
            AND (a.starts_at AT TIME ZONE b.timezone)::date > $2::date
          ORDER BY a.starts_at DESC LIMIT 1`, [pkg.id, input.validUntil], db);
      if (later) throw new DomainError("VALIDATION", `A session is booked on ${later.day}, after that date. Cancel or move it first, or pick a later date.`);
    }
    await q(`UPDATE patient_package SET valid_until=$2, updated_at=now() WHERE id=$1`, [pkg.id, input.validUntil], db);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "package.validity", targetType: "patient_package", targetId: pkg.id,
      changes: { validUntil: [pkg.valid_until, input.validUntil] }, reason, correlationId });
  });
}
