import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { formatINR } from "@/modules/billing/money";
import { amountInWords } from "@/modules/billing/words";
import { formatDate } from "@/lib/format";
import { PrintButton } from "../../print-button";
import { DocTitle, getClinicContact, Letterhead, PrintFooter, Signature } from "../../letterhead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Receipt" };

type Snap = { number: string; issuedAt: string; clinic: string; receivedFrom: string; patientRef: string; method: string; reference: string | null; receivedOn: string; amountPaise: string; allocationsAtIssue: { invoice_number: string; amount_paise: string }[] };

const methodLabel = (m: string) => ({ CASH: "Cash", UPI_MANUAL: "UPI", UPI: "UPI", BANK_TRANSFER: "Bank transfer", CARD: "Card", GATEWAY: "Online" }[m] ?? m.replace(/_/g, " ").toLowerCase());

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  if (!actor.permissions.has("PAYMENT_RECORD") && !actor.permissions.has("FINANCE_VIEW")) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await q1<{ snapshot: Snap; status: string; refunded: string }>(
    `SELECT r.snapshot, p.status, f.refunded_paise::text refunded FROM receipt r JOIN payment p ON p.id=r.payment_id JOIN payment_funds f ON f.payment_id=p.id
      WHERE r.id=$1 AND r.organization_id=$2`, [id, actor.organizationId]);
  if (!r) notFound();
  const s = r.snapshot;
  const live = await getClinicContact(actor.organizationId);
  const clinic = { ...live, name: s.clinic || live.name };
  const reversed = r.status === "REVERSED";
  const allocated = s.allocationsAtIssue.reduce((t, a) => t + BigInt(a.amount_paise), 0n);
  const credit = BigInt(s.amountPaise) - allocated;

  return (
    <article className="pd-doc">
      <div className="no-print mb-6 flex justify-end"><PrintButton /></div>
      {reversed ? <p className="pd-banner">CANCELLED — this payment entry was reversed. This receipt is no longer valid.</p> : null}
      {!reversed && r.refunded !== "0" ? <p className="pd-banner pd-banner-info">{formatINR(r.refunded)} of this payment has since been refunded (see the refund voucher).</p> : null}
      <Letterhead clinic={clinic} />
      <DocTitle title="Payment Receipt" number={s.number} date={formatDate(s.issuedAt)}
        stamp={reversed ? { text: "CANCELLED", tone: "void" } : { text: "RECEIVED", tone: "paid" }} />

      <section className="pd-meta">
        <dl className="pd-kv">
          <dt>Received from</dt><dd>{s.receivedFrom}</dd>
          <dt>Patient no.</dt><dd>{s.patientRef}</dd>
        </dl>
        <dl className="pd-kv">
          <dt>Date received</dt><dd>{formatDate(s.receivedOn)}</dd>
          <dt>Payment mode</dt><dd>{methodLabel(s.method)}</dd>
          {s.reference ? <><dt>Reference</dt><dd>{s.reference}</dd></> : null}
        </dl>
      </section>

      <div className="pd-amount">
        <p className="pd-words">Amount received<strong>{amountInWords(s.amountPaise)}</strong></p>
        <p className="pd-big">{formatINR(s.amountPaise)}</p>
      </div>

      <section className="pd-section">
        <h2>Applied to</h2>
        {s.allocationsAtIssue.length === 0 ? <p>Held as account credit at the time of receipt.</p> : (
          <table className="pd-table" style={{ marginTop: 0 }}>
            <thead><tr><th style={{ width: 32 }}>#</th><th>Bill no.</th><th className="num">Amount applied</th></tr></thead>
            <tbody>
              {s.allocationsAtIssue.map((a, i) => <tr key={i}><td>{i + 1}</td><td>{a.invoice_number}</td><td className="num">{formatINR(a.amount_paise)}</td></tr>)}
              {credit > 0n ? <tr><td>{s.allocationsAtIssue.length + 1}</td><td>Held as account credit</td><td className="num">{formatINR(credit)}</td></tr> : null}
            </tbody>
          </table>
        )}
      </section>

      <Signature clinicName={clinic.name} />
      <PrintFooter clinic={clinic} />
    </article>
  );
}
