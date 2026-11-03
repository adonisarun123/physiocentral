import { tx, q, q1, pgErrorCode } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit, enqueue } from "@/modules/audit";
import { assertPermission, type Actor } from "@/modules/auth/actor";
import { publicRef } from "@/lib/security/tokens";
import { findSlots } from "./availability";
import { BOOKING_POLICY_VERSION } from "./booking";

/**
 * Phone / walk-in booking entered by staff. Unlike an online request, staff
 * have spoken to the patient, so it is CONFIRMED directly — but through the
 * same rules: the slot must be valid for the service, the clinician must work
 * then, and the reservation insert (exclusion constraint) is the final guard
 * against double booking. Lead time is not enforced for staff.
 */
export async function createStaffBooking(
  actor: Actor,
  input: { patientId: string; serviceId: string; therapistId?: string | null; startsAt: string; source: "PHONE" | "WALK_IN"; reason?: string },
  correlationId: string,
) {
  assertPermission(actor, "APPOINTMENT_ACCEPT");
  if (Number.isNaN(new Date(input.startsAt).getTime())) throw new DomainError("VALIDATION", "Choose a time.");
  try {
    return await tx(async (db) => {
      const patient = await q1<{ id: string }>(`SELECT id FROM patient WHERE id=$1 AND organization_id=$2 AND NOT archived`, [input.patientId, actor.organizationId], db);
      if (!patient) throw new DomainError("NOT_FOUND", "Patient not found.");
      const svc = await q1<{ id: string; branch_id: string; duration_minutes: number; buffer_before_minutes: number; buffer_after_minutes: number }>(
        `SELECT s.id, sb.branch_id, s.duration_minutes, s.buffer_before_minutes, s.buffer_after_minutes
           FROM service s JOIN service_branch sb ON sb.service_id=s.id JOIN branch b ON b.id=sb.branch_id
          WHERE s.id=$1 AND s.organization_id=$2 AND s.status='ACTIVE' ORDER BY b.public DESC, b.created_at LIMIT 1`,
        [input.serviceId, actor.organizationId], db);
      if (!svc) throw new DomainError("VALIDATION", "That service is not active at this clinic.");

      const slots = await findSlots({ branchId: svc.branch_id, serviceId: svc.id, therapistId: input.therapistId || null, exactStart: new Date(input.startsAt).toISOString(), enforceLeadTime: false }, db);
      if (!slots.length) throw new DomainError("SLOT_UNAVAILABLE", "That time is no longer free for an eligible physiotherapist. Pick another time.");
      const chosen = slots[0];
      await q(`SELECT id FROM resource WHERE id=$1 FOR UPDATE`, [chosen.resource_id], db);
      await q(`UPDATE resource_reservation SET state='EXPIRED' WHERE resource_id=$1 AND state='HELD' AND expires_at <= now()`, [chosen.resource_id], db);

      const price = await q1<{ unit_price_paise: string }>(
        `SELECT unit_price_paise FROM service_price_version WHERE service_id=$1 AND (branch_id=$2 OR branch_id IS NULL) AND valid_during @> now() ORDER BY branch_id NULLS LAST LIMIT 1`,
        [svc.id, svc.branch_id], db);
      const startsAt = new Date(chosen.starts_at);
      const endsAt = new Date(chosen.ends_at);
      const reference = publicRef("PC");
      const appt = (await q1<{ id: string }>(
        `INSERT INTO appointment (organization_id, public_ref, patient_id, service_id, branch_id, mode, requested_therapist_id, therapist_id,
           starts_at, ends_at, duration_minutes, buffer_before_minutes, buffer_after_minutes, status, source, contact_verified,
           reason_brief, quoted_price_paise, policy_version, created_by)
         VALUES ($1,$2,$3,$4,$5,'CLINIC',$6,$7,$8,$9,$10,$11,$12,'CONFIRMED',$13,true,$14,$15,$16,$17) RETURNING id`,
        [actor.organizationId, reference, patient.id, svc.id, svc.branch_id, input.therapistId || null, chosen.therapist_id,
         startsAt, endsAt, svc.duration_minutes, svc.buffer_before_minutes, svc.buffer_after_minutes, input.source,
         input.reason?.trim().slice(0, 500) || null, price?.unit_price_paise ?? null, BOOKING_POLICY_VERSION, actor.label], db))!;
      await q(
        `INSERT INTO resource_reservation (resource_id, appointment_id, occupied_at, state)
         VALUES ($1,$2, tstzrange($3::timestamptz - make_interval(mins => $5), $4::timestamptz + make_interval(mins => $6), '[)'), 'CONFIRMED')`,
        [chosen.resource_id, appt.id, startsAt, endsAt, svc.buffer_before_minutes, svc.buffer_after_minutes], db);
      await q(`INSERT INTO appointment_status_event (appointment_id, from_status, to_status, actor, reason) VALUES ($1,NULL,'CONFIRMED',$2,$3)`,
        [appt.id, actor.label, `source=${input.source}`], db);
      await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "appointment.staff_book", targetType: "appointment", targetId: appt.id, changes: { source: input.source, therapistId: chosen.therapist_id }, correlationId });
      await enqueue(db, "appointment.confirmed", `appt.confirmed:${appt.id}:1`, { appointmentId: appt.id });
      return { appointmentId: appt.id, reference, therapistId: chosen.therapist_id, startsAt: startsAt.toISOString() };
    });
  } catch (e) {
    if (pgErrorCode(e) === "23P01") throw new DomainError("SLOT_UNAVAILABLE", "Someone just booked that time. Pick another time.");
    throw e;
  }
}
