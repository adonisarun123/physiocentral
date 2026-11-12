import "server-only";
import nodemailer from "nodemailer";
import { q1 } from "@/lib/db";
import { displayPhone, formatDateTime } from "@/lib/format";

/**
 * Front-desk alert for a new web booking request (a "lead").
 *
 * Sent straight after the request is stored, so the clinic does not have to
 * keep the admin Request inbox open. The request itself is already saved by
 * the time this runs: a mail failure is logged and never fails the booking.
 *
 * The patient's free-text reason and accessibility notes are deliberately left
 * out of the email (health information stays in the admin panel, §13).
 *
 * Config (all required to send; missing config = skip with a log line):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  — SMTP account
 *   FROM_EMAIL                                  — optional, defaults to SMTP_USER
 *   LEAD_NOTIFY_EMAIL                           — recipient(s), comma separated
 */

export interface LeadAlertData {
  reference: string;
  patientName: string;
  phone: string | null;
  email: string | null;
  isNewPatient: boolean | null;
  serviceName: string;
  therapistName: string | null;
  startsAt: Date | string;
  timezone: string;
  clinicName: string;
  adminUrl: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Header values must be single-line: strip CR/LF so user input cannot inject headers. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

export function buildLeadAlert(d: LeadAlertData): { subject: string; text: string; html: string } {
  const when = formatDateTime(d.startsAt, d.timezone);
  const phone = d.phone ? displayPhone(d.phone) : "not given";
  const patientType = d.isNewPatient === null ? "Not sure" : d.isNewPatient ? "New patient" : "Returning patient";
  const rows: [string, string][] = [
    ["Name", d.patientName],
    ["Phone", phone],
    ["Email", d.email ?? "not given"],
    ["Service", d.serviceName],
    ["Requested time", when],
    ["Preferred physiotherapist", d.therapistName ?? "No preference"],
    ["Patient type", patientType],
    ["Reference", d.reference],
  ];
  const subject = oneLine(`New appointment request: ${d.patientName} · ${d.serviceName} · ${when}`);
  const text = [
    `New appointment request from the ${d.clinicName} website.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "This is a request, not a confirmed booking. Accept or reject it here:",
    d.adminUrl,
  ].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1b1b1f;max-width:560px">
<p style="font-size:17px;margin:0 0 12px"><strong>New appointment request</strong></p>
<p style="margin:0 0 16px">From the ${esc(d.clinicName)} website.</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
${rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#5f5f66;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0"><strong>${esc(v)}</strong></td></tr>`).join("\n")}
</table>
${d.phone ? `<p style="margin:16px 0 0"><a href="tel:${esc(d.phone)}">Call ${esc(phone)}</a></p>` : ""}
<p style="margin:16px 0 0">This is a request, not a confirmed booking.<br><a href="${esc(d.adminUrl)}">Open the Request inbox to accept or reject it</a></p>
</div>`;
  return { subject, text, html };
}

export function leadAlertConfig(env: NodeJS.ProcessEnv = process.env) {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  const to = (env.LEAD_NOTIFY_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!host || !user || !pass || to.length === 0) return null;
  const port = Number(env.SMTP_PORT ?? 587) || 587;
  return { host, port, secure: port === 465, user, pass, from: env.FROM_EMAIL?.trim() || user, to };
}

/** Look the request up by its public reference and email the front desk. Never throws. */
export async function sendLeadAlert(reference: string, correlationId: string): Promise<"sent" | "skipped" | "failed"> {
  try {
    const cfg = leadAlertConfig();
    if (!cfg) {
      console.warn(`[${correlationId}] lead alert skipped: SMTP_* / LEAD_NOTIFY_EMAIL not configured`);
      return "skipped";
    }
    const row = await q1<{
      full_name: string; is_new_patient: boolean | null; phone: string | null; email: string | null;
      service_name: string; therapist_name: string | null; starts_at: Date; timezone: string; clinic_name: string;
    }>(
      `SELECT p.full_name, p.is_new_patient,
              (SELECT value FROM patient_contact WHERE patient_id = p.id AND kind = 'PHONE' ORDER BY preferred DESC LIMIT 1) AS phone,
              (SELECT value FROM patient_contact WHERE patient_id = p.id AND kind = 'EMAIL' LIMIT 1) AS email,
              s.name AS service_name, t.display_name AS therapist_name, a.starts_at, b.timezone, o.trade_name AS clinic_name
         FROM appointment a
         JOIN patient p ON p.id = a.patient_id
         JOIN service s ON s.id = a.service_id
         JOIN branch b ON b.id = a.branch_id
         JOIN organization o ON o.id = a.organization_id
         LEFT JOIN therapist t ON t.id = a.requested_therapist_id
        WHERE a.public_ref = $1`,
      [reference],
    );
    if (!row) {
      console.error(`[${correlationId}] lead alert failed: request ${reference} not found`);
      return "failed";
    }
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const mail = buildLeadAlert({
      reference,
      patientName: row.full_name,
      phone: row.phone,
      email: row.email,
      isNewPatient: row.is_new_patient,
      serviceName: row.service_name,
      therapistName: row.therapist_name,
      startsAt: row.starts_at,
      timezone: row.timezone,
      clinicName: row.clinic_name,
      adminUrl: `${site}/admin/requests`,
    });
    const transport = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.secure, auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    });
    await transport.sendMail({ from: { name: row.clinic_name, address: cfg.from }, to: cfg.to, ...mail });
    console.info(`[${correlationId}] lead alert sent for ${reference}`);
    return "sent";
  } catch (err) {
    console.error(`[${correlationId}] lead alert failed for ${reference}`, err instanceof Error ? err.message : err);
    return "failed";
  }
}
