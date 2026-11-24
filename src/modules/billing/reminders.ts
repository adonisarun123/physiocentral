import { getPool, q, q1 } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit } from "@/modules/audit";
import { assertPermission, type Actor, type StaffActor } from "@/modules/auth/actor";
import { formatINR } from "@/modules/billing/money";
import { displayPhone, formatDate, patientNumber } from "@/lib/format";
import { escapeHtml, mailConfigured, oneLine, sendMail } from "@/modules/notifications/mailer";

/**
 * Payment reminders by email (until WhatsApp is switched on).
 *
 * - Lists patients with unpaid issued bills (from invoice_balance, so credit
 *   notes and allocated payments are already taken off).
 * - A reminder is not sent when the patient has unapplied credit (apply it
 *   first), has no email, has opted out of transactional messages, or was
 *   reminded in the last 3 days.
 * - The email names bill numbers, dates and amounts only: no services or
 *   anything clinical.
 * - Every attempt, sent or failed, is logged in payment_reminder and the audit history.
 */

export const REMINDER_COOLDOWN_HOURS = 72;
const BULK_LIMIT = 50;

export interface OutstandingRow {
  patient_id: string; full_name: string; op_number: number | null; public_ref: string;
  email: string | null; phone: string | null;
  due_paise: string; credit_paise: string; bills: number; oldest_issued_at: Date;
  last_reminder_at: Date | null; last_reminder_status: string | null; opted_out: boolean;
}

const OUTSTANDING_SQL = `
  WITH due AS (
    SELECT b.patient_id, sum(b.amount_due_paise) AS due, count(*)::int AS bills, min(i.issued_at) AS oldest
      FROM invoice_balance b JOIN invoice i ON i.id=b.invoice_id
     WHERE b.organization_id=$1 AND b.amount_due_paise > 0
     GROUP BY b.patient_id),
  credit AS (
    SELECT p.patient_id, sum(f.unallocated_paise) AS amt
      FROM payment p JOIN payment_funds f ON f.payment_id=p.id
     WHERE p.organization_id=$1 AND p.status='VERIFIED' AND f.unallocated_paise > 0
     GROUP BY p.patient_id)
  SELECT d.patient_id, p.full_name, p.op_number, p.public_ref,
         (SELECT value FROM patient_contact c WHERE c.patient_id=p.id AND c.kind='EMAIL' ORDER BY c.preferred DESC, c.created_at LIMIT 1) email,
         (SELECT value FROM patient_contact c WHERE c.patient_id=p.id AND c.kind='PHONE' ORDER BY c.preferred DESC, c.created_at LIMIT 1) phone,
         d.due::text due_paise, COALESCE(cr.amt, 0)::text credit_paise, d.bills, d.oldest oldest_issued_at,
         r.created_at last_reminder_at, r.status last_reminder_status,
         COALESCE((SELECT NOT k.granted FROM consent_record k WHERE k.patient_id=p.id AND k.purpose='TRANSACTIONAL_COMMS' AND k.withdrawn_at IS NULL
                    ORDER BY k.created_at DESC LIMIT 1), false) opted_out
    FROM due d JOIN patient p ON p.id=d.patient_id
    LEFT JOIN credit cr ON cr.patient_id=d.patient_id
    LEFT JOIN LATERAL (SELECT created_at, status FROM payment_reminder x WHERE x.patient_id=p.id ORDER BY created_at DESC LIMIT 1) r ON true`;

export function listOutstanding(actor: StaffActor) {
  assertPermission(actor, "PAYMENT_REMIND");
  return q<OutstandingRow>(`${OUTSTANDING_SQL} ORDER BY d.oldest`, [actor.organizationId]);
}

/** Why a reminder can't go out right now, or null if it can. */
export function reminderBlock(r: Pick<OutstandingRow, "email" | "credit_paise" | "opted_out" | "last_reminder_at" | "last_reminder_status">, now = new Date()): string | null {
  if (r.opted_out) return "Patient opted out of messages";
  if (!r.email) return "No email on file — call instead";
  if (BigInt(r.credit_paise) > 0n) return "Has unapplied credit — apply it to the bills first";
  if (r.last_reminder_at && r.last_reminder_status === "SENT"
      && now.getTime() - new Date(r.last_reminder_at).getTime() < REMINDER_COOLDOWN_HOURS * 3600_000) return "Reminded in the last 3 days";
  return null;
}

export function buildReminderEmail(d: {
  clinicName: string; clinicPhone: string | null; patientName: string; bills: { number: string; issuedAt: Date; duePaise: string }[]; totalPaise: string;
}) {
  const phone = d.clinicPhone ? displayPhone(d.clinicPhone) : null;
  const subject = oneLine(`${d.clinicName}: balance of ${formatINR(d.totalPaise)} due`);
  const rows = d.bills.map((b) => [b.number, formatDate(b.issuedAt), formatINR(b.duePaise)] as const);
  const pay = `You can pay at the front desk on your next visit${phone ? `, or call us on ${phone} to pay by UPI or bank transfer` : ""}. If you have already paid, please ignore this email and accept our thanks.`;
  const text = [
    `Dear ${d.patientName},`,
    "",
    `This is a friendly reminder from ${d.clinicName} that ${formatINR(d.totalPaise)} is due on the following bill${d.bills.length === 1 ? "" : "s"}:`,
    "",
    ...rows.map(([n, dt, amt]) => `  ${n}  (${dt})  ${amt} due`),
    "",
    pay,
    "",
    `Regards,`,
    d.clinicName,
  ].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1b1b1f;max-width:560px">
<p>Dear ${escapeHtml(d.patientName)},</p>
<p>This is a friendly reminder from ${escapeHtml(d.clinicName)} that <strong>${escapeHtml(formatINR(d.totalPaise))}</strong> is due on the following bill${d.bills.length === 1 ? "" : "s"}:</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:8px 0 16px">
<tr><th align="left" style="padding:6px 12px 6px 0;border-bottom:1px solid #ccc">Bill</th><th align="left" style="padding:6px 12px 6px 0;border-bottom:1px solid #ccc">Date</th><th align="right" style="padding:6px 0;border-bottom:1px solid #ccc">Due</th></tr>
${rows.map(([n, dt, amt]) => `<tr><td style="padding:6px 12px 6px 0">${escapeHtml(n)}</td><td style="padding:6px 12px 6px 0">${escapeHtml(dt)}</td><td align="right" style="padding:6px 0">${escapeHtml(amt)}</td></tr>`).join("\n")}
</table>
<p>${escapeHtml(pay)}</p>
<p>Regards,<br>${escapeHtml(d.clinicName)}</p>
</div>`;
  return { subject, text, html };
}

/** Email one patient their outstanding balance. Throws a DomainError if it can't be sent. */
export async function sendPaymentReminder(actor: Actor, input: { patientId: string }, correlationId: string) {
  assertPermission(actor, "PAYMENT_REMIND");
  if (!/^[0-9a-f-]{36}$/i.test(input.patientId)) throw new DomainError("NOT_FOUND", "Patient not found.");
  if (!mailConfigured()) throw new DomainError("FEATURE_DISABLED", "Email isn't set up on this site (SMTP settings missing).");
  const row = await q1<OutstandingRow>(`${OUTSTANDING_SQL} WHERE d.patient_id=$2`, [actor.organizationId, input.patientId]);
  if (!row) throw new DomainError("VALIDATION", "This patient has nothing due.");
  const block = reminderBlock(row);
  if (block) throw new DomainError("VALIDATION", `${block}.`);
  return deliver(actor, row, correlationId);
}

async function deliver(actor: StaffActor, row: OutstandingRow, correlationId: string) {
  const [bills, clinic] = await Promise.all([
    q<{ id: string; number: string; issued_at: Date; due: string }>(
      `SELECT i.id, i.number, i.issued_at, b.amount_due_paise::text due FROM invoice_balance b JOIN invoice i ON i.id=b.invoice_id
        WHERE b.patient_id=$1 AND b.organization_id=$2 AND b.amount_due_paise > 0 ORDER BY i.issued_at`, [row.patient_id, actor.organizationId]),
    q1<{ name: string; phone: string | null; email: string | null }>(
      `SELECT o.trade_name name, COALESCE((SELECT phone_e164 FROM branch WHERE organization_id=o.id ORDER BY public DESC, created_at LIMIT 1), o.phone_e164) phone, o.email
         FROM organization o WHERE o.id=$1`, [actor.organizationId]),
  ]);
  const total = bills.reduce((s, b) => s + BigInt(b.due), 0n).toString();
  const mail = buildReminderEmail({
    clinicName: clinic?.name ?? "The clinic", clinicPhone: clinic?.phone ?? null, patientName: row.full_name,
    bills: bills.map((b) => ({ number: b.number, issuedAt: b.issued_at, duePaise: b.due })), totalPaise: total,
  });
  const replyTo = clinic?.email || (process.env.LEAD_NOTIFY_EMAIL ?? "").split(",")[0]?.trim() || undefined;
  let error: string | null = null;
  try {
    await sendMail({ fromName: clinic?.name ?? "Clinic", to: row.email!, replyTo, ...mail });
  } catch (e) {
    error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    console.error(`[${correlationId}] payment reminder failed for ${patientNumber(row)}`, error);
  }
  const db = getPool();
  await db.query(
    `INSERT INTO payment_reminder (organization_id, patient_id, sent_to, amount_due_paise, invoice_ids, status, error, sent_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [actor.organizationId, row.patient_id, row.email, total, bills.map((b) => b.id), error ? "FAILED" : "SENT", error, actor.label]);
  await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: error ? "payment.reminder_failed" : "payment.reminder", targetType: "patient", targetId: row.patient_id,
    changes: { amount: total, bills: bills.length }, correlationId });
  if (error) throw new DomainError("VALIDATION", "The email could not be sent. Check the email address, or try again later.");
  return { sentTo: row.email!, amountPaise: total };
}

/** Remind every patient who can be reminded right now (up to 50 per run). */
export async function sendAllPaymentReminders(actor: Actor, correlationId: string) {
  assertPermission(actor, "PAYMENT_REMIND");
  if (!mailConfigured()) throw new DomainError("FEATURE_DISABLED", "Email isn't set up on this site (SMTP settings missing).");
  const rows = await listOutstanding(actor);
  const eligible = rows.filter((r) => !reminderBlock(r));
  let sent = 0, failed = 0;
  for (const r of eligible.slice(0, BULK_LIMIT)) {
    try { await deliver(actor, r, correlationId); sent++; } catch { failed++; }
  }
  return { sent, failed, skipped: rows.length - eligible.length + Math.max(0, eligible.length - BULK_LIMIT) };
}
