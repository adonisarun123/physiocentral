import type { Metadata } from "next";
import Link from "next/link";
import { q, q1 } from "@/lib/db";
import { resolveManageToken } from "@/modules/scheduling/manage-link";
import { formatINR } from "@/modules/billing/money";
import { formatDateTime } from "@/lib/format";
import { StatusBadge, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { patientCancelAction, patientDecideEstimateAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your appointment request", robots: { index: false, follow: false }, referrer: "no-referrer" };

const PATIENT_STATUS: Record<string, string> = {
  REQUESTED: "Request received — pending clinic confirmation",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  REJECTED: "The clinic could not offer this time",
  CANCELLED: "Cancelled",
  NO_SHOW: "Marked as missed",
};

/** Secure management link (§5.3): no third-party scripts, no-store, no-referrer, minimal data. */
export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveManageToken(token);
  if (!link) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold">This link is not valid</h1>
        <p className="mt-3">It may have expired or been replaced. Please contact the clinic and quote your reference number.</p>
        <p className="mt-3"><Link href="/contact">Contact the clinic</Link></p>
      </div>
    );
  }
  const a = (await q1<{ id: string; public_ref: string; status: string; starts_at: Date; service: string; branch: string; timezone: string; patient_message: string | null; therapist: string | null }>(
    `SELECT a.id, a.public_ref, a.status, a.starts_at, s.name AS service, b.name AS branch, b.timezone, a.patient_message, t.display_name AS therapist
       FROM appointment a JOIN service s ON s.id=a.service_id JOIN branch b ON b.id=a.branch_id LEFT JOIN therapist t ON t.id=a.therapist_id
      WHERE a.id=$1`, [link.appointmentId]))!;
  const estimates = await q<{ id: string; version_no: number; status: string; total_paise: string; valid_until: Date | null; content_hash: string | null }>(
    `SELECT v.id, v.version_no, v.status, v.total_paise, v.valid_until, v.content_hash
       FROM estimate_version v JOIN estimate e ON e.id=v.estimate_id
      WHERE e.appointment_id=$1 AND v.status IN ('SENT','ACCEPTED','DECLINED') ORDER BY v.created_at DESC`, [a.id]);
  const lines = estimates.length
    ? await q<{ estimate_version_id: string; description: string; quantity: string; total_paise: string; is_extra: boolean; reason: string | null }>(
        `SELECT estimate_version_id, description, trim_scale(quantity)::text AS quantity, total_paise, is_extra, reason FROM estimate_line WHERE estimate_version_id = ANY($1::uuid[]) ORDER BY sort_order, id`,
        [estimates.map((e) => e.id)])
    : [];
  const cancellable = ["REQUESTED", "CONFIRMED"].includes(a.status);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Your appointment</h1>
      <p className="mt-1 text-[var(--color-ink-muted)]">Reference <span className="font-mono">{a.public_ref}</span></p>
      <div className="card mt-4 space-y-2">
        <p><StatusBadge status={a.status} /> <span className="ml-2 font-semibold">{PATIENT_STATUS[a.status] ?? a.status}</span></p>
        <p><strong>Service:</strong> {a.service}</p>
        <p><strong>Location:</strong> {a.branch}</p>
        <p><strong>{a.status === "REQUESTED" ? "Requested time" : "Time"}:</strong> {formatDateTime(a.starts_at, a.timezone)}</p>
        {a.therapist ? <p><strong>Therapist:</strong> {a.therapist}</p> : null}
        {a.patient_message ? <Notice>{a.patient_message}</Notice> : null}
      </div>

      {estimates.map((e) => {
        const ls = lines.filter((l) => l.estimate_version_id === e.id);
        const extras = ls.filter((l) => l.is_extra);
        return (
          <section key={e.id} className="card mt-6" aria-labelledby={`est-${e.id}`}>
            <h2 id={`est-${e.id}`} className="text-lg font-bold">Cost estimate (version {e.version_no}) <StatusBadge status={e.status} /></h2>
            <div className="table-region" role="region" aria-label="Estimate lines" tabIndex={0}>
              <table className="data mt-2">
                <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {ls.map((l, i) => (
                    <tr key={i}><td>{l.description}{l.is_extra ? <span className="block text-sm text-[var(--color-ink-muted)]">Additional: {l.reason}</span> : null}</td>
                      <td className="num">{l.quantity}</td><td className="num">{formatINR(l.total_paise)}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><th colSpan={2}>Total payable</th><td className="num font-bold">{formatINR(e.total_paise)}</td></tr></tfoot>
              </table>
            </div>
            {extras.length ? <p className="mt-2 text-sm">Includes additional items totalling {formatINR(extras.reduce((s, l) => s + BigInt(l.total_paise), 0n))}.</p> : null}
            {e.valid_until ? <p className="text-sm text-[var(--color-ink-muted)]">Valid until {formatDateTime(e.valid_until, a.timezone)}.</p> : null}
            {e.status === "SENT" ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <ActionForm action={patientDecideEstimateAction}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="versionId" value={e.id} />
                  <input type="hidden" name="contentHash" value={e.content_hash ?? ""} />
                  <input type="hidden" name="decision" value="ACCEPTED" />
                  <SubmitButton>Accept estimate of {formatINR(e.total_paise)}</SubmitButton>
                </ActionForm>
                <ActionForm action={patientDecideEstimateAction}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="versionId" value={e.id} />
                  <input type="hidden" name="contentHash" value={e.content_hash ?? ""} />
                  <input type="hidden" name="decision" value="DECLINED" />
                  <SubmitButton variant="secondary">Decline</SubmitButton>
                </ActionForm>
              </div>
            ) : null}
          </section>
        );
      })}

      {cancellable ? (
        <section className="card mt-6">
          <h2 className="text-lg font-bold">Cancel this {a.status === "REQUESTED" ? "request" : "appointment"}</h2>
          <ActionForm action={patientCancelAction} confirm="Cancel this appointment?">
            <input type="hidden" name="token" value={token} />
            <label htmlFor="reason" className="field-label mt-2">Reason</label>
            <input id="reason" name="reason" className="input" required maxLength={200} />
            <div className="mt-3"><SubmitButton variant="danger">Cancel appointment</SubmitButton></div>
          </ActionForm>
        </section>
      ) : null}
      <p className="mt-6 text-sm text-[var(--color-ink-muted)]">Need to reschedule? Please call the clinic and quote your reference.</p>
    </div>
  );
}
