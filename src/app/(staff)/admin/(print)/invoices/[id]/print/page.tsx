import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { formatINR } from "@/modules/billing/money";
import { amountInWords } from "@/modules/billing/words";
import { formatDate } from "@/lib/format";
import { PrintButton } from "../../../print-button";
import { DocTitle, getClinicContact, Letterhead, PrintFooter, Signature } from "../../../letterhead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bill" };

type Snapshot = {
  documentType: string; number: string; issuedAt: string;
  supplier: { tradeName: string; legalName: string | null; gstin: string | null; phone: string | null; email: string | null; identityVerified: boolean; branch: { name: string; address: string; phone: string | null } | null };
  billTo: { name: string; patientRef: string };
  service: { appointmentRef: string; date: string } | null;
  lines: { description: string; quantity: string; billing_unit: string; unit_price_paise: string; discount_paise: string; tax_rate_bp: number; tax_paise: string; total_paise: string }[];
  totals: { subtotalPaise: string; taxPaise: string; totalPaise: string };
  asOfIssue: { paymentsAppliedPaise: string; balanceDuePaise: string };
  roundingPolicy: string; rendererVersion: string;
};

const TITLE: Record<string, string> = { BILL: "Bill", BILL_OF_SUPPLY: "Bill of Supply", TAX_INVOICE: "Tax Invoice" };
const qty = (q: string, unit: string) => `${q.replace(/\.?0+$/, "")} ${unit.toLowerCase()}`;

/** Rendered only from the immutable issue snapshot, so reprints reproduce the same data (§9.2). */
export default async function InvoicePrint({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const row = await q1<{ snapshot: Snapshot | null; status: string; due_now: string | null }>(
    `SELECT i.snapshot, i.status, b.amount_due_paise::text AS due_now
       FROM invoice i LEFT JOIN invoice_balance b ON b.invoice_id=i.id
      WHERE i.id=$1 AND i.organization_id=$2`, [id, actor.organizationId]);
  if (!row?.snapshot || row.status === "DRAFT") notFound();
  const s = row.snapshot;
  const live = await getClinicContact(actor.organizationId);
  // Letterhead: the supplier identity on the snapshot wins; contact gaps are filled from the clinic's current details.
  const clinic = {
    name: s.supplier.tradeName || live.name,
    address: s.supplier.branch?.address || live.address,
    phone: s.supplier.branch?.phone ?? s.supplier.phone ?? live.phone,
    email: s.supplier.email ?? live.email,
  };

  const total = BigInt(s.totals.totalPaise);
  const dueNow = row.due_now === null ? null : BigInt(row.due_now);
  const voided = row.status === "VOIDED";
  const stamp = voided ? { text: "VOID", tone: "void" as const }
    : total === 0n || dueNow === null ? null
    : dueNow <= 0n ? { text: "PAID", tone: "paid" as const }
    : dueNow < total ? { text: "PART PAID", tone: "part" as const }
    : { text: "PAYMENT DUE", tone: "due" as const };
  const hasDiscount = s.lines.some((l) => l.discount_paise !== "0");
  const hasTax = s.lines.some((l) => l.tax_paise !== "0") || s.totals.taxPaise !== "0";
  const statusChanged = !voided && dueNow !== null && dueNow.toString() !== s.asOfIssue.balanceDuePaise;

  return (
    <article className="pd-doc">
      <div className="no-print mb-6 flex justify-end"><PrintButton /></div>
      {!s.supplier.identityVerified ? <p className="pd-banner">SPECIMEN — clinic legal identity not yet verified</p> : null}
      {voided ? <p className="pd-banner">VOID — this bill was cancelled and is no longer payable.</p> : null}
      <Letterhead clinic={clinic} extra={s.supplier.gstin ? <p>GSTIN {s.supplier.gstin}</p> : null} />
      <DocTitle title={TITLE[s.documentType] ?? "Bill"} number={s.number} date={formatDate(s.issuedAt)} stamp={stamp} />

      <section className="pd-meta">
        <dl className="pd-kv">
          <dt>Billed to</dt><dd>{s.billTo.name}</dd>
          <dt>Patient no.</dt><dd>{s.billTo.patientRef}</dd>
        </dl>
        <dl className="pd-kv">
          <dt>Bill date</dt><dd>{formatDate(s.issuedAt)}</dd>
          {s.service ? <><dt>Visit date</dt><dd>{formatDate(s.service.date)}</dd><dt>Appointment</dt><dd>{s.service.appointmentRef}</dd></> : null}
          {s.supplier.legalName ? <><dt>Billed by</dt><dd>{s.supplier.legalName}</dd></> : null}
        </dl>
      </section>

      <table className="pd-table">
        <thead><tr>
          <th style={{ width: 32 }}>#</th><th>Description</th><th className="num">Qty</th><th className="num">Rate</th>
          {hasDiscount ? <th className="num">Discount</th> : null}{hasTax ? <th className="num">Tax</th> : null}<th className="num">Amount</th>
        </tr></thead>
        <tbody>{s.lines.map((l, i) => (
          <tr key={i}>
            <td>{i + 1}</td><td>{l.description}</td><td className="num">{qty(l.quantity, l.billing_unit)}</td><td className="num">{formatINR(l.unit_price_paise)}</td>
            {hasDiscount ? <td className="num">{l.discount_paise === "0" ? "—" : `− ${formatINR(l.discount_paise)}`}</td> : null}
            {hasTax ? <td className="num">{formatINR(l.tax_paise)}</td> : null}
            <td className="num">{formatINR(l.total_paise)}</td>
          </tr>
        ))}</tbody>
      </table>

      <div className="pd-sum">
        <p className="pd-words">Amount in words<strong>{amountInWords(total)}</strong></p>
        <table className="pd-totals"><tbody>
          <tr className="pd-sub"><td>Sub total</td><td>{formatINR(s.totals.subtotalPaise)}</td></tr>
          {hasTax ? <tr className="pd-sub"><td>Tax</td><td>{formatINR(s.totals.taxPaise)}</td></tr> : null}
          <tr className="pd-grand"><td>Total (INR)</td><td>{formatINR(s.totals.totalPaise)}</td></tr>
          <tr className="pd-paid"><td>Paid at billing</td><td>{formatINR(s.asOfIssue.paymentsAppliedPaise)}</td></tr>
          <tr className="pd-bal"><td>Balance at billing</td><td>{formatINR(s.asOfIssue.balanceDuePaise)}</td></tr>
        </tbody></table>
      </div>

      {statusChanged && dueNow !== null ? (
        <p className="pd-banner pd-banner-info mt-4">
          {dueNow <= 0n ? "Status today: paid in full." : `Status today: ${formatINR(dueNow)} outstanding.`} Later payments are listed on their own receipts.
        </p>
      ) : null}

      <p className="pd-note">This original bill is never altered; later payments appear on receipts and account statements. Rounding: {s.roundingPolicy}. Template {s.rendererVersion}.</p>
      <Signature clinicName={clinic.name} />
      <PrintFooter clinic={clinic} />
    </article>
  );
}
