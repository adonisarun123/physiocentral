import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, EmptyState, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatINR } from "@/modules/billing/money";
import { displayPhone, formatDate, formatDateTime, patientNumber } from "@/lib/format";
import { listOutstanding, reminderBlock } from "@/modules/billing/reminders";
import { mailConfigured } from "@/modules/notifications/mailer";
import { sendAllRemindersAction, sendReminderAction } from "../../ops-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment reminders" };

export default async function RemindersPage() {
  const actor = await requireStaff("PAYMENT_REMIND");
  const rows = await listOutstanding(actor);
  const total = rows.reduce((s, r) => s + BigInt(r.due_paise), 0n);
  const ready = rows.filter((r) => !reminderBlock(r)).length;
  const emailOn = mailConfigured();

  return (
    <>
      <PageHeader title="Payment reminders" lead={`${rows.length} patient${rows.length === 1 ? "" : "s"} with unpaid bills · ${formatINR(total)} to collect`}>
        {emailOn && ready ? (
          <ActionForm action={sendAllRemindersAction} confirm={`Email a reminder to ${ready} patient${ready === 1 ? "" : "s"}?`}>
            <SubmitButton>Email all {ready} ready</SubmitButton>
          </ActionForm>
        ) : null}
      </PageHeader>
      {!emailOn ? <div className="mb-4"><Notice tone="warn">Email isn&apos;t set up on this site (SMTP settings are missing), so reminders can&apos;t be sent yet.</Notice></div> : null}
      <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
        The email lists bill numbers, dates and amounts only, never treatment details. A patient isn&apos;t emailed again within 3 days. WhatsApp reminders can be added later.
      </p>
      {rows.length === 0 ? <EmptyState>Nothing outstanding. Every issued bill is paid.</EmptyState> : (
        <div className="card table-region" role="region" aria-label="Unpaid balances" tabIndex={0}>
          <table className="data">
            <thead><tr><th>Patient</th><th>Contact</th><th className="num">Due</th><th>Oldest bill</th><th>Last reminder</th><th>Reminder</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const block = reminderBlock(r);
                return (
                  <tr key={r.patient_id}>
                    <td>{can(actor, "PATIENT_CONTACT_VIEW") ? <Link href={`/admin/patients/${r.patient_id}`} className="font-semibold">{r.full_name}</Link> : <span className="font-semibold">{r.full_name}</span>}
                      <span className="block font-mono text-xs">{patientNumber(r)}</span></td>
                    <td className="text-sm">{r.phone ? displayPhone(r.phone) : "—"}<span className="block">{r.email ?? "no email"}</span></td>
                    <td className="num">{formatINR(r.due_paise)}<span className="block text-xs text-[var(--color-ink-muted)]">{r.bills} bill{r.bills === 1 ? "" : "s"}</span>
                      {r.credit_paise !== "0" ? <span className="block text-xs">credit {formatINR(r.credit_paise)}</span> : null}</td>
                    <td>{formatDate(r.oldest_issued_at)}</td>
                    <td className="text-sm">{r.last_reminder_at ? <>{formatDateTime(r.last_reminder_at)}{r.last_reminder_status === "FAILED" ? <span className="block font-semibold text-[var(--color-danger)]">failed</span> : null}</> : "—"}</td>
                    <td>{block || !emailOn ? <span className="text-sm text-[var(--color-ink-muted)]">{block ?? "Email not set up"}</span> : (
                      <ActionForm action={sendReminderAction}>
                        <input type="hidden" name="patientId" value={r.patient_id} />
                        <SubmitButton small variant="secondary">Email reminder</SubmitButton>
                      </ActionForm>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
