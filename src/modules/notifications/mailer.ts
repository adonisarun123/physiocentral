import nodemailer from "nodemailer";

/**
 * Outgoing email through the clinic's existing SMTP account (the same SMTP_*
 * settings the lead alert uses). Tests swap the transport with setMailTransportForTests.
 */

export interface MailMessage {
  fromName: string;
  to: string | string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}

export function smtpConfig(env: NodeJS.ProcessEnv = process.env) {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(env.SMTP_PORT ?? 587) || 587;
  return { host, port, secure: port === 465, user, pass, from: env.FROM_EMAIL?.trim() || user };
}

type Transport = { sendMail: (m: Record<string, unknown>) => Promise<unknown> };
let testTransport: Transport | null = null;

/** Test hook: capture mail instead of sending it. Pass null to restore. */
export function setMailTransportForTests(t: Transport | null) {
  testTransport = t;
}

export function mailConfigured(): boolean {
  return !!testTransport || !!smtpConfig();
}

/** Sends one message. Throws on failure; callers decide whether that is fatal. */
export async function sendMail(m: MailMessage): Promise<void> {
  const cfg = smtpConfig();
  const transport: Transport | null = testTransport ?? (cfg ? nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: cfg.secure, auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  }) : null);
  if (!transport) throw new Error("SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS)");
  await transport.sendMail({
    from: { name: m.fromName, address: cfg?.from ?? "test@localhost" },
    to: m.to, replyTo: m.replyTo, subject: m.subject, text: m.text, html: m.html,
  });
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Header values must be single-line: strip CR/LF so stored text cannot inject headers. */
export const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
