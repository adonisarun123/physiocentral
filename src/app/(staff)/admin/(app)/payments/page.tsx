import Link from "next/link";
import type { Metadata } from "next";
import { q } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, StatusBadge, EmptyState } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatINR } from "@/modules/billing/money";
import { verifyPaymentAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const actor = await requireStaff("PAYMENT_RECORD");
  const rows = await q<{ id: string; method: string; amount_paise: string; status: string; reference: string | null; received_on: string; receiving_account: string; patient: string; patient_id: string; unallocated_paise: string; receipt_id: string | null; receipt_number: string | null }>(
    `SELECT p.id, p.method, p.amount_paise, p.status, p.reference, to_char(p.received_on,'YYYY-MM-DD') received_on, p.receiving_account,
            pt.full_name patient, pt.id patient_id, f.unallocated_paise::text, r.id receipt_id, r.number receipt_number
       FROM payment p JOIN patient pt ON pt.id=p.patient_id JOIN payment_funds f ON f.payment_id=p.id LEFT JOIN receipt r ON r.payment_id=p.id
      WHERE p.organization_id=$1 ORDER BY (p.status='PENDING') DESC, p.created_at DESC LIMIT 200`,
    [actor.organizationId],
  );
  return (
    <>
      <PageHeader title="Payments" lead="Pending payments need a designated verifier. Verified payments are never edited; corrections are reversal events.">
        <Link href="/admin/payments/new" className="btn btn-primary">+ Record payment</Link>
      </PageHeader>
      {rows.length === 0 ? <EmptyState>No payments recorded yet.</EmptyState> : (
        <div className="card table-region" role="region" aria-label="Payments" tabIndex={0}>
          <table className="data">
            <thead><tr><th>Received</th><th>Patient</th><th>Method</th><th>Into</th><th>Status</th><th className="num">Amount</th><th className="num">Unallocated</th><th>Receipt / action</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.received_on}</td><td><Link href={`/admin/patients/${p.patient_id}`}>{p.patient}</Link></td>
                  <td>{p.method.replace("_", " ").toLowerCase()}{p.reference ? <span className="block text-sm">{p.reference}</span> : null}</td>
                  <td>{p.receiving_account}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="num">{formatINR(p.amount_paise)}</td>
                  <td className="num">{p.status === "VERIFIED" ? formatINR(p.unallocated_paise) : "—"}</td>
                  <td>
                    {p.receipt_id ? <Link href={`/admin/receipts/${p.receipt_id}`}>{p.receipt_number}</Link> : null}
                    {p.status === "PENDING" && can(actor, "PAYMENT_VERIFY") ? (
                      <ActionForm action={verifyPaymentAction} confirm="Confirm these funds were actually received?">
                        <input type="hidden" name="paymentId" value={p.id} /><SubmitButton small>Verify</SubmitButton>
                      </ActionForm>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
