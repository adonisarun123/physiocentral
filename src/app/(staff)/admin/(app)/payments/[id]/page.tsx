import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { q, q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, StatusBadge, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatINR } from "@/modules/billing/money";
import { paymentDisplayStatus } from "@/modules/payments/refunds";
import { formatDateTime, patientNumber, todayInZone } from "@/lib/format";
import { refundPaymentAction, reversePaymentAction } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment" };

const UUID = /^[0-9a-f-]{36}$/i;
const methodLabel = (m: string) => ({ CASH: "Cash", UPI_MANUAL: "UPI", BANK_TRANSFER: "Bank transfer", GATEWAY: "Online" }[m] ?? m);

export default async function PaymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ appointment?: string }> }) {
  const actor = await requireStaff("PAYMENT_RECORD");
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const p = await q1<{
    id: string; method: string; amount_paise: string; status: string; reference: string | null; received_on: string; receiving_account: string; note: string | null;
    reversed_at: Date | null; reversal_reason: string | null; reversed_by_name: string | null;
    patient_id: string; patient: string; public_ref: string; op_number: number | null;
    allocated_paise: string; unallocated_paise: string; refunded_paise: string; receipt_id: string | null; receipt_number: string | null;
  }>(
    `SELECT p.id, p.method, p.amount_paise, p.status, p.reference, to_char(p.received_on,'YYYY-MM-DD') received_on, p.receiving_account, p.note,
            p.reversed_at, p.reversal_reason,
            (SELECT s.display_name FROM staff_member s WHERE 'staff:'||s.id::text = p.reversed_by) reversed_by_name,
            pt.id patient_id, pt.full_name patient, pt.public_ref, pt.op_number,
            f.allocated_paise::text, f.unallocated_paise::text, f.refunded_paise::text, r.id receipt_id, r.number receipt_number
       FROM payment p JOIN patient pt ON pt.id=p.patient_id JOIN payment_funds f ON f.payment_id=p.id LEFT JOIN receipt r ON r.payment_id=p.id
      WHERE p.id=$1 AND p.organization_id=$2`, [id, actor.organizationId]);
  if (!p) notFound();
  const [refunds, bills, appt] = await Promise.all([
    q<{ id: string; number: string; amount_paise: string; method: string; refunded_on: string; reason: string; approved_by_name: string; created_at: Date }>(
      `SELECT id, number, amount_paise, method, to_char(refunded_on,'YYYY-MM-DD') refunded_on, reason, approved_by_name, created_at
         FROM payment_refund WHERE payment_id=$1 ORDER BY created_at`, [id]),
    q<{ invoice_id: string; number: string; net: string }>(
      `SELECT a.invoice_id, i.number, sum(CASE WHEN a.kind='ALLOCATE' THEN a.amount_paise ELSE -a.amount_paise END)::text net
         FROM payment_allocation a JOIN invoice i ON i.id=a.invoice_id WHERE a.payment_id=$1
        GROUP BY a.invoice_id, i.number HAVING sum(CASE WHEN a.kind='ALLOCATE' THEN a.amount_paise ELSE -a.amount_paise END) > 0 ORDER BY i.number`, [id]),
    sp.appointment && UUID.test(sp.appointment)
      ? q1<{ id: string; public_ref: string; starts_at: Date; status: string }>(
          `SELECT id, public_ref, starts_at, status FROM appointment WHERE id=$1 AND organization_id=$2 AND patient_id=$3`, [sp.appointment, actor.organizationId, p.patient_id])
      : Promise.resolve(undefined),
  ]);
  const refundable = p.status === "VERIFIED" ? BigInt(p.amount_paise) - BigInt(p.refunded_paise) : 0n;
  const rupees = (v: bigint) => (Number(v) / 100).toFixed(2);

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/payments">← Payments</Link></p>
      <PageHeader title={`Payment ${formatINR(p.amount_paise)}`} lead={<><Link href={`/admin/patients/${p.patient_id}`} className="font-semibold">{p.patient}</Link> · <span className="font-mono">{patientNumber(p)}</span> · received {p.received_on}</>}>
        <StatusBadge status={paymentDisplayStatus(p.status, p.amount_paise, p.refunded_paise)} />
        {p.receipt_id ? <Link href={`/admin/receipts/${p.receipt_id}`} className="btn btn-secondary btn-sm">Receipt {p.receipt_number}</Link> : null}
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card">
          <h2 className="text-lg font-bold">Details</h2>
          <dl className="mt-2 space-y-1">
            <div><dt className="inline font-semibold">Method: </dt><dd className="inline">{methodLabel(p.method)}{p.reference ? ` — ${p.reference}` : ""}</dd></div>
            <div><dt className="inline font-semibold">Received into: </dt><dd className="inline">{p.receiving_account}</dd></div>
            {p.note ? <div><dt className="inline font-semibold">Note: </dt><dd className="inline">{p.note}</dd></div> : null}
            <div><dt className="inline font-semibold">Applied to bills: </dt><dd className="inline">{bills.length ? bills.map((b, i) => <span key={b.invoice_id}>{i ? ", " : ""}<Link href={`/admin/invoices/${b.invoice_id}`}>{b.number}</Link> ({formatINR(b.net)})</span>) : "none"}</dd></div>
            {p.status === "VERIFIED" ? <>
              <div><dt className="inline font-semibold">Refunded so far: </dt><dd className="inline">{formatINR(p.refunded_paise)}</dd></div>
              <div><dt className="inline font-semibold">Kept as credit (not on any bill): </dt><dd className="inline">{formatINR(p.unallocated_paise)}</dd></div>
              <div><dt className="inline font-semibold">Still refundable: </dt><dd className="inline font-bold">{formatINR(refundable)}</dd></div>
            </> : null}
          </dl>
          {p.status === "REVERSED" ? (
            <div className="mt-4"><Notice tone="danger" title="Reversed — this entry was a mistake">
              {p.reversal_reason}{p.reversed_at ? ` · ${formatDateTime(p.reversed_at)}` : ""}{p.reversed_by_name ? ` · by ${p.reversed_by_name}` : ""}. No money is counted for it.
            </Notice></div>
          ) : null}

          <h2 className="mt-6 text-lg font-bold">Refunds</h2>
          {refunds.length === 0 ? <p className="mt-2 text-[var(--color-ink-muted)]">None.</p> : (
            <ul className="mt-2 divide-y divide-[var(--color-line)]">{refunds.map((r) => (
              <li key={r.id} className="py-2">
                <span className="font-semibold">{formatINR(r.amount_paise)}</span> · {methodLabel(r.method).toLowerCase()} · {r.refunded_on} · <Link href={`/admin/refunds/${r.id}`}>{r.number}</Link>
                <span className="block text-sm text-[var(--color-ink-muted)]">Approved by {r.approved_by_name} · {r.reason}</span>
              </li>
            ))}</ul>
          )}
        </section>

        <div className="grid content-start gap-6">
          {p.status === "VERIFIED" && refundable > 0n && can(actor, "PAYMENT_REFUND") ? (
            <section className="card">
              <h2 className="text-lg font-bold">Refund this payment</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">Use this when money is paid back to the patient. Refund part of it or all of it. Your name is recorded as the person who approved it.</p>
              {appt ? <p className="mt-2 text-sm">For appointment <Link href={`/admin/appointments/${appt.id}`} className="font-mono">{appt.public_ref}</Link> on {formatDateTime(appt.starts_at)} ({appt.status.toLowerCase().replace("_", " ")}).</p> : null}
              <ActionForm action={refundPaymentAction} className="mt-3" confirm="Record this refund? It cannot be edited or deleted afterwards.">
                <input type="hidden" name="paymentId" value={p.id} />
                <input type="hidden" name="patientId" value={p.patient_id} />
                {appt ? <input type="hidden" name="appointmentId" value={appt.id} /> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className="field-label" htmlFor="rf-a">Amount to refund (₹)</label><input id="rf-a" name="amountRupees" required className="input" inputMode="decimal" defaultValue={rupees(refundable)} />
                    <span className="field-hint">Up to {formatINR(refundable)}</span></div>
                  <div><label className="field-label" htmlFor="rf-m">Paid back by</label>
                    <select id="rf-m" name="method" className="input" defaultValue={p.method === "GATEWAY" ? "BANK_TRANSFER" : p.method}>
                      <option value="CASH">Cash</option><option value="UPI_MANUAL">UPI</option><option value="BANK_TRANSFER">Bank transfer</option></select></div>
                  <div><label className="field-label" htmlFor="rf-d">Date paid back</label><input id="rf-d" name="refundedOn" type="date" required className="input" defaultValue={todayInZone()} min={p.received_on} max={todayInZone()} /></div>
                  <div><label className="field-label" htmlFor="rf-f">Paid from</label><input id="rf-f" name="paidFrom" required className="input" defaultValue={p.receiving_account} /></div>
                  <div><label className="field-label" htmlFor="rf-r">UTR / reference (UPI &amp; bank)</label><input id="rf-r" name="reference" className="input" /></div>
                  <div><label className="field-label" htmlFor="rf-why">Reason</label><input id="rf-why" name="reason" required minLength={3} maxLength={300} className="input" defaultValue={appt ? "Appointment cancelled" : ""} placeholder="e.g. Appointment cancelled" /></div>
                </div>
                {bills.length ? (
                  <label className="mt-3 flex items-start gap-2"><input type="checkbox" name="creditBills" defaultChecked className="mt-1 h-5 w-5" />
                    <span>Also reduce the bill by the refunded amount (the service was not provided). <span className="block text-sm text-[var(--color-ink-muted)]">This payment is on {bills.map((b) => b.number).join(", ")}. Ticked: a credit note is issued so the bill does not show an amount due. Unticked: the bill goes back to unpaid.</span></span></label>
                ) : null}
                <div className="mt-3"><SubmitButton variant="danger">Record refund</SubmitButton></div>
              </ActionForm>
            </section>
          ) : null}
          {p.status === "VERIFIED" && refundable <= 0n ? <section className="card"><Notice tone="info" title="Refunded in full">Nothing is left to refund on this payment.</Notice></section> : null}

          {p.status === "VERIFIED" && refunds.length === 0 && can(actor, "PAYMENT_VERIFY") ? (
            <section className="card">
              <details>
                <summary className="cursor-pointer font-semibold">Entered by mistake? Reverse this entry</summary>
                <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Only for an entry that should not exist — wrong patient, wrong amount, or money that never arrived. No money is paid back. Bills it was applied to become unpaid again. If money was actually returned to the patient, use a refund instead.</p>
                <ActionForm action={reversePaymentAction} className="mt-3" confirm="Reverse this payment entry? This cannot be undone.">
                  <input type="hidden" name="paymentId" value={p.id} />
                  <input type="hidden" name="patientId" value={p.patient_id} />
                  <label className="field-label" htmlFor="rv-why">Reason</label><input id="rv-why" name="reason" required minLength={3} maxLength={300} className="input" placeholder="e.g. Entered twice" />
                  <div className="mt-3"><SubmitButton small variant="danger">Reverse entry</SubmitButton></div>
                </ActionForm>
              </details>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
