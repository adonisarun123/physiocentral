import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { q, q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, StatusBadge, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { computeBalance, formatINR } from "@/modules/billing/money";
import { formatDate, formatDateTime, todayInZone } from "@/lib/format";
import { allocateAction, discardInvoiceAction, issueInvoiceAction, recordPaymentAction, verifyPaymentAction } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const inv = await q1<{ id: string; number: string | null; status: string; version: number; patient_id: string; appointment_id: string | null; subtotal_paise: string; tax_paise: string; total_paise: string; issued_at: Date | null; document_type: string; patient: string }>(
    `SELECT i.*, p.full_name patient FROM invoice i JOIN patient p ON p.id=i.patient_id WHERE i.id=$1 AND i.organization_id=$2`,
    [id, actor.organizationId],
  );
  if (!inv || (!can(actor, "INVOICE_DRAFT") && !can(actor, "FINANCE_VIEW"))) notFound();
  const [lines, bal, allocations, patientPayments] = await Promise.all([
    q<{ description: string; quantity: string; billing_unit: string; unit_price_paise: string; discount_paise: string; tax_paise: string; total_paise: string }>(
      `SELECT description, trim_scale(quantity)::text quantity, billing_unit, unit_price_paise, discount_paise, tax_paise, total_paise FROM invoice_line WHERE invoice_id=$1 ORDER BY sort_order, id`, [id]),
    q1<{ net_allocated_paise: string }>(`SELECT net_allocated_paise::text FROM invoice_balance WHERE invoice_id=$1`, [id]),
    q<{ amount_paise: string; kind: string; created_at: Date; method: string; reference: string | null; receipt_id: string | null; receipt_number: string | null }>(
      `SELECT a.amount_paise, a.kind, a.created_at, p.method, p.reference, r.id receipt_id, r.number receipt_number
         FROM payment_allocation a JOIN payment p ON p.id=a.payment_id LEFT JOIN receipt r ON r.payment_id=p.id
        WHERE a.invoice_id=$1 ORDER BY a.created_at`, [id]),
    q<{ id: string; method: string; amount_paise: string; status: string; reference: string | null; received_on: string; unallocated_paise: string }>(
      `SELECT p.id, p.method, p.amount_paise, p.status, p.reference, to_char(p.received_on,'YYYY-MM-DD') received_on, f.unallocated_paise::text
         FROM payment p JOIN payment_funds f ON f.payment_id=p.id WHERE p.patient_id=$1 AND p.status IN ('PENDING','VERIFIED') ORDER BY p.created_at DESC`, [inv.patient_id]),
  ]);
  const balance = inv.status === "ISSUED" ? computeBalance(BigInt(inv.total_paise), BigInt(bal?.net_allocated_paise ?? "0")) : null;

  return (
    <>
      <PageHeader title={inv.number ?? "Draft invoice"} lead={<>{inv.patient}{inv.issued_at ? ` · issued ${formatDateTime(inv.issued_at)}` : ""}</>}>
        <StatusBadge status={inv.status} />
        {balance ? <StatusBadge status={balance.collectionStatus} /> : null}
        {inv.status === "ISSUED" ? <Link href={`/admin/invoices/${inv.id}/print`} className="btn btn-secondary btn-sm">Print / PDF</Link> : null}
        {inv.appointment_id ? <Link href={`/admin/appointments/${inv.appointment_id}`} className="btn btn-secondary btn-sm">Appointment</Link> : null}
      </PageHeader>

      <section className="card">
        <div className="table-region" role="region" aria-label="Invoice lines" tabIndex={0}>
          <table className="data">
            <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Discount</th><th className="num">Tax</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}><td>{l.description}</td><td className="num">{l.quantity} {l.billing_unit.toLowerCase()}</td><td className="num">{formatINR(l.unit_price_paise)}</td>
                  <td className="num">{formatINR(l.discount_paise)}</td><td className="num">{formatINR(l.tax_paise)}</td><td className="num">{formatINR(l.total_paise)}</td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th colSpan={5}>Subtotal</th><td className="num">{formatINR(inv.subtotal_paise)}</td></tr>
              <tr><th colSpan={5}>Tax</th><td className="num">{formatINR(inv.tax_paise)}</td></tr>
              <tr><th colSpan={5}>Total</th><td className="num font-bold">{formatINR(inv.total_paise)}</td></tr>
              {balance ? <>
                <tr><th colSpan={5}>Verified payments applied</th><td className="num">{formatINR(bal?.net_allocated_paise ?? "0")}</td></tr>
                <tr><th colSpan={5}>Amount due</th><td className="num font-bold">{formatINR(balance.amountDuePaise)}</td></tr>
              </> : null}
            </tfoot>
          </table>
        </div>
        {inv.status === "DRAFT" ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {can(actor, "INVOICE_ISSUE") ? (
              <ActionForm action={issueInvoiceAction} confirm="Issue this invoice? Issued invoices cannot be edited.">
                <input type="hidden" name="id" value={inv.id} /><input type="hidden" name="version" value={inv.version} />
                <SubmitButton>Issue invoice</SubmitButton>
              </ActionForm>
            ) : <p className="text-sm">Billing staff with issue permission must issue this draft.</p>}
            <ActionForm action={discardInvoiceAction} confirm="Discard this draft? Its charges become billable again.">
              <input type="hidden" name="id" value={inv.id} /><input type="hidden" name="version" value={inv.version} />
              <SubmitButton variant="danger">Discard draft</SubmitButton>
            </ActionForm>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">Issued documents are immutable. Corrections need a credit note (not available in this release — contact your accountant).</p>
        )}
      </section>

      {inv.status === "ISSUED" ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="card">
            <h2 className="text-lg font-bold">Payments applied</h2>
            {allocations.length === 0 ? <p className="mt-2 text-[var(--color-ink-muted)]">None yet.</p> : (
              <ul className="mt-2 space-y-1">{allocations.map((a, i) => (
                <li key={i}>{formatDate(a.created_at)} · {a.method.replace("_", " ").toLowerCase()} {a.reference ? `(${a.reference})` : ""} · {a.kind === "RELEASE" ? "−" : ""}{formatINR(a.amount_paise)}
                  {a.receipt_id ? <> · <Link href={`/admin/receipts/${a.receipt_id}`}>{a.receipt_number}</Link></> : null}</li>
              ))}</ul>
            )}
            {patientPayments.some((p) => p.status === "PENDING" || BigInt(p.unallocated_paise) > 0n) ? (
              <div className="mt-4">
                <h3 className="font-semibold">Patient funds not yet applied</h3>
                <ul className="mt-1 space-y-2">
                  {patientPayments.filter((p) => p.status === "PENDING" || BigInt(p.unallocated_paise) > 0n).map((p) => (
                    <li key={p.id} className="rounded border border-[var(--color-line)] p-2 text-sm">
                      {p.method.replace("_", " ").toLowerCase()} {formatINR(p.amount_paise)} on {p.received_on} <StatusBadge status={p.status} />
                      {p.status === "VERIFIED" ? ` · unallocated ${formatINR(p.unallocated_paise)}` : ""}
                      {p.status === "PENDING" && can(actor, "PAYMENT_VERIFY") ? (
                        <ActionForm action={verifyPaymentAction} className="mt-1"><input type="hidden" name="paymentId" value={p.id} /><input type="hidden" name="invoiceId" value={inv.id} /><SubmitButton small>Verify and apply</SubmitButton></ActionForm>
                      ) : null}
                      {p.status === "VERIFIED" && can(actor, "PAYMENT_ALLOCATE") && balance && balance.amountDuePaise > 0n ? (
                        <ActionForm action={allocateAction} className="mt-1 flex items-end gap-2">
                          <input type="hidden" name="paymentId" value={p.id} /><input type="hidden" name="invoiceId" value={inv.id} />
                          <label className="sr-only" htmlFor={`al-${p.id}`}>Amount to apply (₹)</label>
                          <input id={`al-${p.id}`} name="amountRupees" className="input w-32" inputMode="decimal" defaultValue={(Number(BigInt(p.unallocated_paise) < balance.amountDuePaise ? BigInt(p.unallocated_paise) : balance.amountDuePaise) / 100).toFixed(2)} />
                          <SubmitButton small>Apply</SubmitButton>
                        </ActionForm>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {can(actor, "PAYMENT_RECORD") && balance && balance.amountDuePaise > 0n ? (
            <section className="card">
              <h2 className="text-lg font-bold">Record payment</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">A screenshot is not a verified payment. UPI and bank transfers need the UTR / reference; a designated verifier confirms them.</p>
              <ActionForm action={recordPaymentAction} className="mt-3">
                <input type="hidden" name="patientId" value={inv.patient_id} /><input type="hidden" name="invoiceId" value={inv.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className="field-label" htmlFor="amount">Amount (₹)</label><input id="amount" name="amountRupees" required className="input" inputMode="decimal" defaultValue={(Number(balance.amountDuePaise) / 100).toFixed(2)} /></div>
                  <div><label className="field-label" htmlFor="method">Method</label>
                    <select id="method" name="method" className="input"><option value="CASH">Cash</option><option value="UPI_MANUAL">UPI (manual)</option><option value="BANK_TRANSFER">Bank transfer</option></select></div>
                  <div><label className="field-label" htmlFor="receivedOn">Date received</label><input id="receivedOn" name="receivedOn" type="date" required className="input" defaultValue={todayInZone()} /></div>
                  <div><label className="field-label" htmlFor="acct">Received into</label><input id="acct" name="receivingAccount" required className="input" placeholder="e.g. Front desk drawer / Clinic UPI" /></div>
                  <div><label className="field-label" htmlFor="ref">Reference / UTR</label><input id="ref" name="reference" className="input" /></div>
                  <div><label className="field-label" htmlFor="note">Note</label><input id="note" name="note" className="input" /></div>
                </div>
                {can(actor, "PAYMENT_VERIFY") ? (
                  <label className="mt-3 flex items-center gap-2"><input type="checkbox" name="verifyNow" className="h-5 w-5" /> I have verified receipt of these funds (issues a receipt and applies to this invoice)</label>
                ) : <p className="mt-3 text-sm">This will be saved as <strong>pending</strong> until a verifier confirms it.</p>}
                <div className="mt-3"><SubmitButton>Record payment</SubmitButton></div>
              </ActionForm>
            </section>
          ) : balance?.collectionStatus === "PAID" ? (
            <section className="card"><Notice tone="ok" title="Paid in full">Balance is zero. Any surplus stays on the patient&apos;s account as unallocated credit.</Notice></section>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
