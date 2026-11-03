import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { formatINR } from "@/modules/billing/money";
import { formatDate } from "@/lib/format";
import { PrintButton } from "../../../print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice" };

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

/** Rendered only from the immutable issue snapshot, so reprints reproduce the same data (§9.2). */
export default async function InvoicePrint({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const row = await q1<{ snapshot: Snapshot | null; status: string }>(`SELECT snapshot, status FROM invoice WHERE id=$1 AND organization_id=$2`, [id, actor.organizationId]);
  if (!row?.snapshot || row.status === "DRAFT") notFound();
  const s = row.snapshot;
  return (
    <article>
      <div className="mb-6 flex justify-end"><PrintButton /></div>
      {!s.supplier.identityVerified ? <p className="mb-4 border-2 border-[var(--color-danger)] p-2 text-center font-bold text-[var(--color-danger)]">SPECIMEN — clinic legal identity not yet verified</p> : null}
      <header className="flex flex-wrap justify-between gap-4 border-b-2 border-[var(--color-ink)] pb-4">
        <div>
          <p className="text-xl font-extrabold">{s.supplier.tradeName}</p>
          {s.supplier.legalName ? <p>{s.supplier.legalName}</p> : null}
          {s.supplier.branch ? <p>{s.supplier.branch.address || s.supplier.branch.name}</p> : null}
          {s.supplier.phone || s.supplier.branch?.phone ? <p>{s.supplier.branch?.phone ?? s.supplier.phone}</p> : null}
          {s.supplier.gstin ? <p>GSTIN: {s.supplier.gstin}</p> : null}
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold">{TITLE[s.documentType] ?? "Bill"}</h1>
          <p>No. <strong>{s.number}</strong></p>
          <p>Date: {formatDate(s.issuedAt)}</p>
        </div>
      </header>
      <section className="mt-4 grid gap-2 sm:grid-cols-2">
        <div><p className="font-semibold">Billed to</p><p>{s.billTo.name}</p><p className="text-sm">Patient ref {s.billTo.patientRef}</p></div>
        {s.service ? <div><p className="font-semibold">Service date</p><p>{formatDate(s.service.date)}</p><p className="text-sm">Appointment {s.service.appointmentRef}</p></div> : null}
      </section>
      <table className="data mt-6">
        <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Discount</th><th className="num">Tax</th><th className="num">Amount</th></tr></thead>
        <tbody>{s.lines.map((l, i) => (
          <tr key={i}><td>{l.description}</td><td className="num">{l.quantity.replace(/\.?0+$/, "")} {l.billing_unit.toLowerCase()}</td><td className="num">{formatINR(l.unit_price_paise)}</td>
            <td className="num">{formatINR(l.discount_paise)}</td><td className="num">{formatINR(l.tax_paise)}</td><td className="num">{formatINR(l.total_paise)}</td></tr>
        ))}</tbody>
        <tfoot>
          <tr><th colSpan={5}>Subtotal</th><td className="num">{formatINR(s.totals.subtotalPaise)}</td></tr>
          <tr><th colSpan={5}>Tax</th><td className="num">{formatINR(s.totals.taxPaise)}</td></tr>
          <tr><th colSpan={5}>Total (INR)</th><td className="num font-bold">{formatINR(s.totals.totalPaise)}</td></tr>
          <tr><th colSpan={5}>Payments applied (as of issue)</th><td className="num">{formatINR(s.asOfIssue.paymentsAppliedPaise)}</td></tr>
          <tr><th colSpan={5}>Balance due (as of issue)</th><td className="num font-bold">{formatINR(s.asOfIssue.balanceDuePaise)}</td></tr>
        </tfoot>
      </table>
      <p className="mt-6 text-sm">Later payments are shown on receipts and account statements; this original document is not altered.</p>
      <p className="mt-2 text-xs text-[var(--color-ink-muted)]">Rounding: {s.roundingPolicy}. Template {s.rendererVersion}.</p>
    </article>
  );
}
