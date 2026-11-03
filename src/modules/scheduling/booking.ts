import { z } from "zod";
import { tx, q1, type Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { newSecretToken, publicRef, sha256Json } from "@/lib/security/tokens";
import { audit, enqueue } from "@/modules/audit";
import { findSlots } from "./availability";
import { normalizeIndianPhone } from "@/modules/patients/contact";

export const PRIVACY_NOTICE_VERSION = "draft-2026-11-03";
export const BOOKING_POLICY_VERSION = "draft-2026-11-03";
const MANAGE_TOKEN_DAYS = 30;

export const bookingRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  therapistId: z.string().uuid().nullable(),
  startsAt: z.string().datetime({ offset: true }),
  fullName: z.string().trim().min(2, "Enter the patient's name").max(120),
  phone: z.string().trim().min(6, "Enter a phone number").max(20),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address").max(200)]).optional(),
  isNewPatient: z.enum(["yes", "no", "unsure"]),
  reasonBrief: z.string().trim().max(500).optional(),
  accessibilityNeeds: z.string().trim().max(500).optional(),
  privacyAck: z.literal(true, { message: "Please confirm you have read the privacy notice" }),
  marketingOptIn: z.boolean().default(false),
});
export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;

export interface BookingRequestResult {
  reference: string;
  status: "REQUESTED";
  startsAt: string;
  timezone: string;
  responseWindow: string;
  manageToken?: string; // only on first response; never persisted in clear text
  replayed: boolean;
}

/**
 * Create an appointment REQUEST (§5.1). Does not reserve capacity and is never
 * described as confirmed. Idempotent by key (BOOK-04): same key + same payload
 * returns the original; same key + different payload is a conflict.
 */
export async function createBookingRequest(
  raw: unknown,
  ctx: { source: "WEB" | "PHONE" | "WALK_IN"; actorLabel: string; correlationId: string },
): Promise<BookingRequestResult> {
  const parsed = bookingRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    throw new DomainError("VALIDATION", "Please correct the highlighted fields.", fieldErrors);
  }
  const input = parsed.data;
  const phone = normalizeIndianPhone(input.phone);
  if (!phone) throw new DomainError("VALIDATION", "Please correct the highlighted fields.", { phone: "Enter a valid phone number, e.g. +91 98765 43210" });

  const { idempotencyKey, ...payload } = input;
  const requestHash = sha256Json({ ...payload, phone });
  const scope = `booking-request:${ctx.source}`;

  return tx(async (db) => {
    const claimed = await q1<{ key: string }>(
      `INSERT INTO idempotency_record (scope, key, request_hash, response) VALUES ($1,$2,$3,'{}'::jsonb)
       ON CONFLICT (scope, key) DO NOTHING RETURNING key`,
      [scope, idempotencyKey, requestHash],
      db,
    );
    if (!claimed) {
      const existing = await q1<{ request_hash: string; response: BookingRequestResult }>(
        `SELECT request_hash, response FROM idempotency_record WHERE scope = $1 AND key = $2`,
        [scope, idempotencyKey],
        db,
      );
      if (!existing || existing.request_hash !== requestHash) {
        throw new DomainError("IDEMPOTENCY_CONFLICT", "This form was already submitted with different details. Please reload the page.");
      }
      return { ...existing.response, replayed: true };
    }

    const branch = await q1<{ id: string; organization_id: string; timezone: string; response_window_text: string }>(
      `SELECT id, organization_id, timezone, response_window_text FROM branch WHERE id = $1 AND public`,
      [input.branchId],
      db,
    );
    const service = await q1<{ id: string; duration_minutes: number; buffer_before_minutes: number; buffer_after_minutes: number }>(
      `SELECT s.id, s.duration_minutes, s.buffer_before_minutes, s.buffer_after_minutes
         FROM service s JOIN service_branch sb ON sb.service_id = s.id AND sb.branch_id = $2
        WHERE s.id = $1 AND s.status = 'ACTIVE' AND s.bookable AND s.public`,
      [input.serviceId, input.branchId],
      db,
    );
    if (!branch || !service) {
      throw new DomainError("VALIDATION", "That service is not available for online requests at this location.");
    }

    // BOOK-01/02: server decides duration and checks the slot against live rules.
    const slots = await findSlots(
      { branchId: branch.id, serviceId: service.id, therapistId: input.therapistId, exactStart: input.startsAt, enforceLeadTime: true },
      db,
    );
    if (slots.length === 0) {
      throw new DomainError("SLOT_UNAVAILABLE", "That time is no longer available. Please choose another time, or ask for a callback.");
    }

    const price = await q1<{ unit_price_paise: string }>(
      `SELECT unit_price_paise FROM service_price_version
        WHERE service_id = $1 AND (branch_id = $2 OR branch_id IS NULL) AND valid_during @> now()
        ORDER BY branch_id NULLS LAST LIMIT 1`,
      [service.id, branch.id],
      db,
    );

    const patientRef = publicRef("PT");
    // Unverified channel: always a new patient record; staff review duplicates (§5.1, §12.3).
    const patient = (await q1<{ id: string }>(
      `INSERT INTO patient (organization_id, public_ref, full_name, is_new_patient)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [branch.organization_id, patientRef, input.fullName, input.isNewPatient === "unsure" ? null : input.isNewPatient === "yes"],
      db,
    ))!;
    await db.query(`INSERT INTO patient_contact (patient_id, kind, value, preferred) VALUES ($1,'PHONE',$2,true)`, [patient.id, phone]);
    if (input.email) {
      await db.query(`INSERT INTO patient_contact (patient_id, kind, value) VALUES ($1,'EMAIL',$2)`, [patient.id, input.email.toLowerCase()]);
    }
    await insertConsent(db, branch.organization_id, patient.id, "BOOKING_PRIVACY_ACK", true, ctx);
    await insertConsent(db, branch.organization_id, patient.id, "TRANSACTIONAL_COMMS", true, ctx);
    await insertConsent(db, branch.organization_id, patient.id, "MARKETING", input.marketingOptIn, ctx);

    const reference = publicRef("PC");
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60_000);
    const appt = (await q1<{ id: string }>(
      `INSERT INTO appointment (organization_id, public_ref, patient_id, service_id, branch_id, mode,
         requested_therapist_id, starts_at, ends_at, duration_minutes, buffer_before_minutes, buffer_after_minutes,
         status, source, contact_verified, reason_brief, accessibility_needs, quoted_price_paise, policy_version, created_by)
       VALUES ($1,$2,$3,$4,$5,'CLINIC',$6,$7,$8,$9,$10,$11,'REQUESTED',$12,false,$13,$14,$15,$16,$17)
       RETURNING id`,
      [
        branch.organization_id, reference, patient.id, service.id, branch.id, input.therapistId,
        startsAt, endsAt, service.duration_minutes, service.buffer_before_minutes, service.buffer_after_minutes,
        ctx.source, input.reasonBrief || null, input.accessibilityNeeds || null, price?.unit_price_paise ?? null,
        BOOKING_POLICY_VERSION, ctx.actorLabel,
      ],
      db,
    ))!;
    await db.query(
      `INSERT INTO appointment_status_event (appointment_id, from_status, to_status, actor, reason) VALUES ($1,NULL,'REQUESTED',$2,$3)`,
      [appt.id, ctx.actorLabel, `source=${ctx.source}`],
    );

    const { token, hash } = newSecretToken();
    await db.query(
      `INSERT INTO manage_token (appointment_id, token_hash, expires_at) VALUES ($1,$2, now() + make_interval(days => $3))`,
      [appt.id, hash, MANAGE_TOKEN_DAYS],
    );

    await enqueue(db, "booking.acknowledgement", `booking.ack:${appt.id}`, { appointmentId: appt.id });
    await audit(db, {
      organizationId: branch.organization_id,
      actor: ctx.actorLabel,
      action: "appointment.request.create",
      targetType: "appointment",
      targetId: appt.id,
      changes: { status: "REQUESTED", source: ctx.source },
      correlationId: ctx.correlationId,
    });

    const result: BookingRequestResult = {
      reference,
      status: "REQUESTED",
      startsAt: startsAt.toISOString(),
      timezone: branch.timezone,
      responseWindow: branch.response_window_text,
      replayed: false,
    };
    await db.query(`UPDATE idempotency_record SET response = $3 WHERE scope = $1 AND key = $2`, [scope, idempotencyKey, JSON.stringify(result)]);
    return { ...result, manageToken: token };
  });
}

async function insertConsent(
  db: Db,
  orgId: string,
  patientId: string,
  purpose: string,
  granted: boolean,
  ctx: { source: string; actorLabel: string },
) {
  await db.query(
    `INSERT INTO consent_record (organization_id, patient_id, purpose, granted, notice_version, method, actor)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [orgId, patientId, purpose, granted, PRIVACY_NOTICE_VERSION, ctx.source === "WEB" ? "WEB_FORM" : `STAFF_${ctx.source}`, ctx.actorLabel],
  );
}
