import { tx, q1, pgErrorCode, type Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit, enqueue } from "@/modules/audit";
import { assertPermission, type Actor, type StaffActor } from "@/modules/auth/actor";
import { findSlots } from "./availability";

export type AppointmentStatus =
  | "REQUESTED" | "AWAITING_PATIENT_CONFIRMATION" | "AWAITING_DEPOSIT" | "CONFIRMED"
  | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED" | "NO_SHOW";

/** Controlled transitions (§6.1). Anything not listed is rejected. */
export const TRANSITIONS: Record<string, { from: AppointmentStatus[]; to: AppointmentStatus }> = {
  check_in: { from: ["CONFIRMED"], to: "CHECKED_IN" },
  start: { from: ["CHECKED_IN"], to: "IN_PROGRESS" },
  complete: { from: ["IN_PROGRESS"], to: "COMPLETED" },
  no_show: { from: ["CONFIRMED"], to: "NO_SHOW" },
};
export type TransitionName = keyof typeof TRANSITIONS;

export const NO_SHOW_THRESHOLD_MINUTES = 15;

interface ApptRow {
  id: string;
  organization_id: string;
  public_ref: string;
  status: AppointmentStatus;
  version: number;
  branch_id: string;
  service_id: string;
  patient_id: string;
  requested_therapist_id: string | null;
  therapist_id: string | null;
  starts_at: Date;
  ends_at: Date;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
}

async function lockAppointment(db: Db, id: string, actor: StaffActor | null): Promise<ApptRow> {
  const row = await q1<ApptRow>(`SELECT * FROM appointment WHERE id = $1 FOR UPDATE`, [id], db);
  // Non-disclosing 404 for other organizations (§19.1).
  if (!row || (actor && row.organization_id !== actor.organizationId)) {
    throw new DomainError("NOT_FOUND", "Appointment not found.");
  }
  return row;
}

function checkVersion(row: ApptRow, expectedVersion: number) {
  if (row.version !== expectedVersion) {
    throw new DomainError("STALE_VERSION", "This appointment was changed by someone else. Reload to see the latest version.");
  }
}

async function recordStatus(db: Db, row: ApptRow, to: AppointmentStatus, actor: string, reason: string | null) {
  await db.query(
    `INSERT INTO appointment_status_event (appointment_id, from_status, to_status, actor, reason) VALUES ($1,$2,$3,$4,$5)`,
    [row.id, row.status, to, actor, reason],
  );
}

export interface AcceptInput {
  appointmentId: string;
  expectedVersion: number;
  therapistId?: string | null;
  startsAt?: string | null;
}

/**
 * Accept a request (§6.2, §25.3). Atomically: lock appointment + resource,
 * expire elapsed holds, re-validate rules, insert the reservation (the
 * exclusion constraint is the final double-booking guard), confirm, and
 * append event + audit + outbox. Material changes return PROPOSAL_REQUIRED.
 */
export async function acceptAppointment(actor: Actor, input: AcceptInput, correlationId: string) {
  assertPermission(actor, "APPOINTMENT_ACCEPT");
  try {
    return await tx(async (db) => {
      const appt = await lockAppointment(db, input.appointmentId, actor);
      checkVersion(appt, input.expectedVersion);
      if (appt.status !== "REQUESTED") {
        throw new DomainError("INVALID_TRANSITION", `Only requested appointments can be accepted (current: ${appt.status}).`);
      }
      const requestedStart = new Date(appt.starts_at).toISOString();
      if (input.startsAt && new Date(input.startsAt).toISOString() !== requestedStart) {
        throw new DomainError("PROPOSAL_REQUIRED", "A different time needs the patient's agreement. Send a proposal instead.");
      }
      if (appt.requested_therapist_id && input.therapistId && input.therapistId !== appt.requested_therapist_id) {
        throw new DomainError("PROPOSAL_REQUIRED", "The patient asked for a specific therapist. Changing it needs their agreement.");
      }
      const therapistPref = appt.requested_therapist_id ?? input.therapistId ?? null;

      const candidates = await findSlots(
        { branchId: appt.branch_id, serviceId: appt.service_id, therapistId: therapistPref, exactStart: requestedStart, enforceLeadTime: false },
        db,
      );
      if (candidates.length === 0) {
        throw new DomainError("SLOT_UNAVAILABLE", "That time is no longer available for an eligible therapist.");
      }
      const chosen = candidates[0];

      // Lock the therapist's global resource row; consistent lock order for multi-resource bookings is by resource id.
      await db.query(`SELECT id FROM resource WHERE id = $1 FOR UPDATE`, [chosen.resource_id]);
      await db.query(
        `UPDATE resource_reservation SET state = 'EXPIRED' WHERE resource_id = $1 AND state = 'HELD' AND expires_at <= now()`,
        [chosen.resource_id],
      );

      await db.query(
        `INSERT INTO resource_reservation (resource_id, appointment_id, occupied_at, state)
         VALUES ($1, $2, tstzrange($3::timestamptz - make_interval(mins => $5), $4::timestamptz + make_interval(mins => $6), '[)'), 'CONFIRMED')`,
        [chosen.resource_id, appt.id, appt.starts_at, appt.ends_at, appt.buffer_before_minutes, appt.buffer_after_minutes],
      );

      const updated = (await q1<{ version: number; public_ref: string; status: string; starts_at: Date }>(
        `UPDATE appointment SET status = 'CONFIRMED', therapist_id = $2, version = version + 1, updated_at = now()
          WHERE id = $1 RETURNING version, public_ref, status, starts_at`,
        [appt.id, chosen.therapist_id],
        db,
      ))!;
      await recordStatus(db, appt, "CONFIRMED", actor.label, null);
      await audit(db, {
        organizationId: actor.organizationId, actor: actor.label, action: "appointment.accept",
        targetType: "appointment", targetId: appt.id,
        changes: { status: ["REQUESTED", "CONFIRMED"], therapistId: chosen.therapist_id }, correlationId,
      });
      await enqueue(db, "appointment.confirmed", `appt.confirmed:${appt.id}:${updated.version}`, { appointmentId: appt.id });
      return {
        reference: updated.public_ref,
        status: updated.status,
        version: updated.version,
        startsAt: new Date(updated.starts_at).toISOString(),
        therapistId: chosen.therapist_id,
      };
    });
  } catch (err) {
    if (pgErrorCode(err) === "23P01") {
      throw new DomainError("SLOT_UNAVAILABLE", "Another booking just took this time. Choose another time or propose an alternative.");
    }
    throw err;
  }
}

export async function rejectAppointment(
  actor: Actor,
  input: { appointmentId: string; expectedVersion: number; patientMessage: string; internalNote?: string },
  correlationId: string,
) {
  assertPermission(actor, "APPOINTMENT_ACCEPT");
  if (!input.patientMessage.trim()) throw new DomainError("VALIDATION", "Add a message for the patient.", { patientMessage: "Required" });
  return tx(async (db) => {
    const appt = await lockAppointment(db, input.appointmentId, actor);
    checkVersion(appt, input.expectedVersion);
    if (appt.status !== "REQUESTED") throw new DomainError("INVALID_TRANSITION", "Only unaccepted requests can be rejected.");
    await db.query(
      `UPDATE appointment SET status='REJECTED', patient_message=$2, internal_note=$3, version=version+1, updated_at=now() WHERE id=$1`,
      [appt.id, input.patientMessage.trim(), input.internalNote?.trim() || null],
    );
    await recordStatus(db, appt, "REJECTED", actor.label, "rejected by staff");
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "appointment.reject", targetType: "appointment", targetId: appt.id, correlationId });
    await enqueue(db, "appointment.rejected", `appt.rejected:${appt.id}`, { appointmentId: appt.id });
  });
}

/**
 * Cancel (§6.1): records actor, reason, time and releases reservations in the
 * same transaction. Staff (with permission) or the patient via a valid link.
 */
export async function cancelAppointment(
  actor: Actor,
  input: { appointmentId: string; expectedVersion?: number; reason: string },
  correlationId: string,
) {
  if (actor.kind === "staff") assertPermission(actor, "APPOINTMENT_CANCEL");
  else if (actor.kind === "patient_link" && actor.appointmentId !== input.appointmentId) {
    throw new DomainError("NOT_FOUND", "Appointment not found.");
  }
  if (!input.reason.trim()) throw new DomainError("VALIDATION", "Give a reason for cancelling.", { reason: "Required" });
  return tx(async (db) => {
    const appt = await lockAppointment(db, input.appointmentId, actor.kind === "staff" ? actor : null);
    if (input.expectedVersion !== undefined) checkVersion(appt, input.expectedVersion);
    if (!["REQUESTED", "AWAITING_PATIENT_CONFIRMATION", "AWAITING_DEPOSIT", "CONFIRMED", "CHECKED_IN"].includes(appt.status)) {
      throw new DomainError("INVALID_TRANSITION", `This appointment cannot be cancelled (current: ${appt.status}).`);
    }
    await db.query(
      `UPDATE resource_reservation SET state='RELEASED' WHERE appointment_id=$1 AND state IN ('HELD','CONFIRMED')`,
      [appt.id],
    );
    await db.query(`UPDATE appointment SET status='CANCELLED', version=version+1, updated_at=now() WHERE id=$1`, [appt.id]);
    await recordStatus(db, appt, "CANCELLED", actor.label, `${input.reason.trim()} [policy ${appt.status}]`);
    await audit(db, { organizationId: appt.organization_id, actor: actor.label, action: "appointment.cancel", targetType: "appointment", targetId: appt.id, reason: input.reason.trim(), correlationId });
    await enqueue(db, "appointment.cancelled", `appt.cancelled:${appt.id}`, { appointmentId: appt.id });
  });
}

/** Attendance transitions. Completion creates the billable charge for the booked service (COST-05). */
export async function transitionAppointment(
  actor: Actor,
  input: { appointmentId: string; expectedVersion: number; transition: TransitionName },
  correlationId: string,
) {
  assertPermission(actor, "APPOINTMENT_TRANSITION");
  const rule = TRANSITIONS[input.transition];
  if (!rule) throw new DomainError("INVALID_TRANSITION", "Unknown action.");
  return tx(async (db) => {
    const appt = await lockAppointment(db, input.appointmentId, actor);
    checkVersion(appt, input.expectedVersion);
    if (!rule.from.includes(appt.status)) {
      throw new DomainError("INVALID_TRANSITION", `Cannot ${input.transition.replace("_", " ")} from ${appt.status}.`);
    }
    if (input.transition === "no_show") {
      const ok = await q1<{ ok: boolean }>(
        `SELECT now() >= $1::timestamptz + make_interval(mins => $2) AS ok`,
        [appt.starts_at, NO_SHOW_THRESHOLD_MINUTES],
        db,
      );
      if (!ok?.ok) throw new DomainError("INVALID_TRANSITION", `No-show can be recorded ${NO_SHOW_THRESHOLD_MINUTES} minutes after the start time.`);
    }
    await db.query(`UPDATE appointment SET status=$2, version=version+1, updated_at=now() WHERE id=$1`, [appt.id, rule.to]);
    await recordStatus(db, appt, rule.to, actor.label, null);

    let chargeId: string | null = null;
    if (rule.to === "COMPLETED") {
      const svc = await q1<{ id: string; name: string; bill_description: string | null; billing_unit: string; unit_price_paise: string | null; rate_bp: number | null; inclusive: boolean | null }>(
        `SELECT s.id, s.name, s.bill_description, s.billing_unit, pv.unit_price_paise, tc.rate_bp, tc.price_inclusive AS inclusive
           FROM service s
           LEFT JOIN LATERAL (
             SELECT * FROM service_price_version p
              WHERE p.service_id = s.id AND (p.branch_id = $2 OR p.branch_id IS NULL) AND p.valid_during @> $3::timestamptz
              ORDER BY p.branch_id NULLS LAST LIMIT 1) pv ON true
           LEFT JOIN tax_category tc ON tc.id = pv.tax_category_id
          WHERE s.id = $1`,
        [appt.service_id, appt.branch_id, appt.starts_at],
        db,
      );
      if (svc?.unit_price_paise != null) {
        const row = await q1<{ id: string }>(
          `INSERT INTO billable_charge (organization_id, patient_id, appointment_id, service_id, description, billing_unit,
             quantity, unit_price_paise, tax_rate_bp, tax_inclusive, performed_verified_by)
           VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10) RETURNING id`,
          [appt.organization_id, appt.patient_id, appt.id, svc.id, svc.bill_description || svc.name, svc.billing_unit,
           svc.unit_price_paise, svc.rate_bp ?? 0, svc.inclusive ?? false, actor.label],
          db,
        );
        chargeId = row!.id;
      }
    }
    await audit(db, {
      organizationId: actor.organizationId, actor: actor.label, action: `appointment.${input.transition}`,
      targetType: "appointment", targetId: appt.id, changes: { status: [appt.status, rule.to], chargeId }, correlationId,
    });
    return { status: rule.to, chargeId };
  });
}
