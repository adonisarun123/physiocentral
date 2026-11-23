import Link from "next/link";
import type { Metadata } from "next";
import { q, q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, StatusBadge, EmptyState } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatINR } from "@/modules/billing/money";
import { paymentDisplayStatus } from "@/modules/payments/refunds";
import { todayInZone } from "@/lib/format";
import { verifyPaymentAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const actor = await requireStaff("PAYMENT_RECORD");
  const today = todayInZone();
  const [rows, totals] = await Promise.all([
    q<{ id: string; method: string; amount_paise: string; status: string; reference: string | null; received_on: string; receiving_account: string; patient: string; patient_id: string; unallocated_paise: string; refunded_paise: string; receipt_id: string | null; receipt_number: string | null }>(
      `SELECT p.id, p.method, p.amount_paise, p.status, p.reference, to_char(p.received_on,'YYYY-MM-DD') received_on, p.receiving_account,
              pt.full_name patient, pt.id patient_id, f.unallocated_paise::text, f.refunded_paise::text, r.id receipt_id, r.number receipt_number
         FROM payment p JOIN patient pt ON pt.id=p.patient_id JOIN payment_funds f ON f.payment_id=p.id LEFT JOIN receipt r ON r.payment_id=p.id
        WHERE p.organization_id=$1 ORDER BY (p.status='PENDING') DESC, p.created_at DESC LIMIT 200`,
      [actor.organizationId],
    ),
    // Money in is counted on the day it was received, money out on the day it was paid back.
    q1<{ day_in: string; day_out: string; month_in: string; month_out: string }>(
      `SELECT
         (SELECT COALESCE(sum(amount_paise),0) FROM payment WHERE organization_id=$1 AND status='VERIFIED' AND received_on=$2::date)::text day_in,
         (SELECT COALESCE(sum(amount_paise),0) FROM payment_refund WHERE organization_id=$1 AND refunded_on=$2::date)::text day_out,
         (SELECT COALESCE(sum(amount_paise),0) FROM payment WHERE organization_id=$1 AND status='VERIFIED'
             AND received_on >= date_trunc('month',$2::date) AND received_on <= $2::date)::text month_in,
         (SELECT COALESCE(sum(amount_paise),0) FROM payment_refund WHERE organization_id=$1
             AND refunded_on >= date_trunc('month',$2::date) AND refunded_on <= $2::date)::text month_out`,
      [actor.organizationId, today],
    ),
  ]);
  const t = totals!;
  const net = (a: string, b: string) => formatINR(BigInt(a) - BigInt(b));
  return (
    <>
      <PageHeader title="Payments" lead="Verified payments are never edited. Money paid back is recorded as a refund; an entry made by mistake is reversed.">
        <Link href="/admin/payments/new" className="btn btn-primary">+ Record payment</Link>
      </PageHeader>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="card"><p className="text-sm text-[var(--color-ink-muted)]">Today, net of refunds</p><p className="text-2xl font-bold">{net(t.day_in, t.day_out)}</p>
          <p className="text-sm text-[var(--color-ink-muted)]">Received {formatINR(t.day_in)} · refunded {formatINR(t.day_out)}</p></div>
        <div className="card"><p className="text-sm text-[var(--color-ink-muted)]">This month, net of refunds</p><p className="text-2xl font-bold">{net(t.month_in, t.month_out)}</p>
          <p className="text-sm text-[var(--color-ink-muted)]">Received {formatINR(t.month_in)} · refunded {formatINR(t.month_out)}</p></div>
      </div>
      {rows.length === 0 ? <EmptyState>No payments recorded yet.</EmptyState> : (
        <div className="card table-region" role="region" aria-label="Payments" tabIndex={0}>
          <table className="data">
            <thead><tr><th>Received</th><th>Patient</th><th>Method</th><th>Into</th><th>Status</th><th className="num">Amount</th><th className="num">Refunded</th><th className="num">Unallocated</th><th>Receipt / action</th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const refundable = p.status === "VERIFIED" && BigInt(p.refunded_paise) < BigInt(p.amount_paise);
                return (
                  <tr key={p.id}>
                    <td>{p.received_on}</td><td><Link href={`/admin/patients/${p.patient_id}`}>{p.patient}</Link></td>
                    <td>{p.method.replace("_", " ").toLowerCase()}{p.reference ? <span className="block text-sm">{p.reference}</span> : null}</td>
                    <td>{p.receiving_account}</td>
                    <td><StatusBadge status={paymentDisplayStatus(p.status, p.amount_paise, p.refunded_paise)} /></td>
                    <td className="num">{formatINR(p.amount_paise)}</td>
                    <td className="num">{p.refunded_paise !== "0" ? formatINR(p.refunded_paise) : "—"}</td>
                    <td className="num">{p.status === "VERIFIED" ? formatINR(p.unallocated_paise) : "—"}</td>
                    <td>
                      {p.receipt_id ? <Link href={`/admin/receipts/${p.receipt_id}`}>{p.receipt_number}</Link> : null}
                      {p.status === "PENDING" && can(actor, "PAYMENT_VERIFY") ? (
                        <ActionForm action={verifyPaymentAction} confirm="Confirm these funds were actually received?">
                          <input type="hidden" name="paymentId" value={p.id} /><SubmitButton small>Verify</SubmitButton>
                        </ActionForm>
                      ) : null}
                      <Link href={`/admin/payments/${p.id}`} className="block text-sm">{refundable && can(actor, "PAYMENT_REFUND") ? "Refund / details" : "Details"}</Link>
                    </td>
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
