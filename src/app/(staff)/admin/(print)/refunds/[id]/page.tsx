import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { formatINR } from "@/modules/billing/money";
import { formatDate } from "@/lib/format";
import type { RefundSnapshot } from "@/modules/payments/refunds";
import { amountInWords } from "@/modules/billing/words";
import { PrintButton } from "../../print-button";
import { DocTitle, getClinicContact, Letterhead, PrintFooter } from "../../letterhead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Refund voucher" };

const methodLabel = (m: string) => ({ CASH: "cash", UPI_MANUAL: "UPI", BANK_TRANSFER: "bank transfer", GATEWAY: "online" }[m] ?? m.toLowerCase());

export default async function RefundVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  if (!actor.permissions.has("PAYMENT_RECORD") && !actor.permissions.has("FINANCE_VIEW")) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await q1<{ snapshot: RefundSnapshot }>(`SELECT snapshot FROM payment_refund WHERE id=$1 AND organization_id=$2`, [id, actor.organizationId]);
  if (!r) notFound();
  const s = r.snapshot;
  const live = await getClinicContact(actor.organizationId);
  const clinic = { ...live, name: s.clinic || live.name };
  return (
    <article className="pd-doc">
      <div className="no-print mb-6 flex justify-end"><PrintButton /></div>
      <Letterhead clinic={clinic} />
      <DocTitle title="Refund Voucher" number={s.number} date={formatDate(s.issuedAt)} stamp={{ text: "REFUNDED", tone: "part" }} />
      <section className="pd-meta">
        <dl className="pd-kv">
          <dt>Refunded to</dt><dd>{s.paidTo}</dd>
          <dt>Patient no.</dt><dd>{s.patientRef}</dd>
          <dt>Reason</dt><dd>{s.reason}</dd>
        </dl>
        <dl className="pd-kv">
          <dt>Date paid back</dt><dd>{formatDate(s.refundedOn)}</dd>
          <dt>Paid back by</dt><dd>{methodLabel(s.method)}{s.reference ? ` — ${s.reference}` : ""}</dd>
          <dt>Paid from</dt><dd>{s.paidFrom}</dd>
          <dt>Approved by</dt><dd>{s.approvedBy}</dd>
        </dl>
      </section>
      <div className="pd-amount">
        <p className="pd-words">Amount refunded<strong>{amountInWords(s.amountPaise)}</strong></p>
        <p className="pd-big">{formatINR(s.amountPaise)}</p>
      </div>
      <section className="pd-section">
        <h2>Original payment</h2>
        <p>{formatINR(s.payment.amountPaise)} by {methodLabel(s.payment.method)}, received {formatDate(s.payment.receivedOn)}{s.payment.receiptNumber ? `, receipt ${s.payment.receiptNumber}` : ""}.
          {s.payment.refundedBeforePaise !== "0" ? ` ${formatINR(s.payment.refundedBeforePaise)} had been refunded before this.` : ""}</p>
      </section>
      {s.bills.length ? (
        <section className="pd-section">
          <h2>Bills affected</h2>
          <table className="pd-table" style={{ marginTop: 0 }}>
            <thead><tr><th>Bill no.</th><th className="num">Taken back</th><th>Effect on the bill</th></tr></thead>
            <tbody>{s.bills.map((b, i) => (
              <tr key={i}><td>{b.invoiceNumber}</td><td className="num">{formatINR(b.releasedPaise)}</td>
                <td>{b.creditNoteNumber ? `Bill reduced by credit note ${b.creditNoteNumber}` : "Bill is unpaid for this amount"}</td></tr>
            ))}</tbody>
          </table>
        </section>
      ) : null}
      <div className="pd-sign">
        <div className="pd-signbox"><span className="pd-signline" />Received by (patient)</div>
        <div className="pd-signbox"><span className="pd-signline" />Authorised signatory<br />For {clinic.name.split(" by ")[0]}</div>
      </div>
      <PrintFooter clinic={clinic} />
    </article>
  );
}
