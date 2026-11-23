import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { formatINR } from "@/modules/billing/money";
import { formatDate } from "@/lib/format";
import type { RefundSnapshot } from "@/modules/payments/refunds";
import { PrintButton } from "../../print-button";

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
  return (
    <article>
      <div className="mb-6 flex justify-end"><PrintButton /></div>
      <header className="border-b-2 border-[var(--color-ink)] pb-3">
        <p className="text-xl font-extrabold">{s.clinic}</p>
        <h1 className="text-2xl font-bold">Refund voucher</h1>
        <p>No. <strong>{s.number}</strong> · {formatDate(s.issuedAt)}</p>
      </header>
      <dl className="mt-4 space-y-1">
        <div><dt className="inline font-semibold">Refunded to: </dt><dd className="inline">{s.paidTo} ({s.patientRef})</dd></div>
        <div><dt className="inline font-semibold">Amount refunded: </dt><dd className="inline text-lg font-bold">{formatINR(s.amountPaise)}</dd></div>
        <div><dt className="inline font-semibold">Paid back by: </dt><dd className="inline">{methodLabel(s.method)}{s.reference ? ` — ${s.reference}` : ""}, from {s.paidFrom}</dd></div>
        <div><dt className="inline font-semibold">Date paid back: </dt><dd className="inline">{s.refundedOn}</dd></div>
        <div><dt className="inline font-semibold">Reason: </dt><dd className="inline">{s.reason}</dd></div>
        <div><dt className="inline font-semibold">Approved by: </dt><dd className="inline">{s.approvedBy}</dd></div>
      </dl>
      <h2 className="mt-6 font-bold">Original payment</h2>
      <p>{formatINR(s.payment.amountPaise)} by {methodLabel(s.payment.method)}, received {s.payment.receivedOn}{s.payment.receiptNumber ? `, receipt ${s.payment.receiptNumber}` : ""}.
        {s.payment.refundedBeforePaise !== "0" ? ` ${formatINR(s.payment.refundedBeforePaise)} had been refunded before this.` : ""}</p>
      {s.bills.length ? (<>
        <h2 className="mt-6 font-bold">Bills affected</h2>
        <ul>{s.bills.map((b, i) => (
          <li key={i}>{b.invoiceNumber}: {formatINR(b.releasedPaise)} taken back{b.creditNoteNumber ? `; bill reduced by credit note ${b.creditNoteNumber}` : "; bill is unpaid for this amount"}</li>
        ))}</ul>
      </>) : null}
      <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
        <p className="border-t border-[var(--color-ink)] pt-1">Received by (patient)</p>
        <p className="border-t border-[var(--color-ink)] pt-1">For {s.clinic}</p>
      </div>
    </article>
  );
}
