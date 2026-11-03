import Link from "next/link";
import type { Metadata } from "next";
import { q } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { PageHeader, StatusBadge, EmptyState } from "@/components/ui";
import { computeBalance, formatINR } from "@/modules/billing/money";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const actor = await requireStaff();
  if (!actor.permissions.has("INVOICE_DRAFT") && !actor.permissions.has("FINANCE_VIEW")) {
    const { redirect } = await import("next/navigation");
    redirect("/admin/forbidden");
  }
  const rows = await q<{ id: string; number: string | null; status: string; total_paise: string; created_at: Date; issued_at: Date | null; patient: string; allocated: string | null }>(
    `SELECT i.id, i.number, i.status, i.total_paise, i.created_at, i.issued_at, p.full_name patient, b.net_allocated_paise::text allocated
       FROM invoice i JOIN patient p ON p.id=i.patient_id LEFT JOIN invoice_balance b ON b.invoice_id=i.id
      WHERE i.organization_id=$1 ORDER BY COALESCE(i.issued_at, i.created_at) DESC LIMIT 200`,
    [actor.organizationId],
  );
  return (
    <>
      <PageHeader title="Invoices" lead="Collection status is derived from verified, allocated payments — never a manual paid flag." />
      {rows.length === 0 ? <EmptyState>No invoices yet. Create one from a completed appointment.</EmptyState> : (
        <div className="card table-region" role="region" aria-label="Invoices" tabIndex={0}>
          <table className="data">
            <thead><tr><th>Number</th><th>Patient</th><th>Date</th><th>Document</th><th>Collection</th><th className="num">Total</th><th className="num">Due</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const bal = r.status === "ISSUED" ? computeBalance(BigInt(r.total_paise), BigInt(r.allocated ?? "0")) : null;
                return (
                  <tr key={r.id}>
                    <td><Link href={`/admin/invoices/${r.id}`}>{r.number ?? "Draft"}</Link></td>
                    <td>{r.patient}</td>
                    <td>{formatDate(r.issued_at ?? r.created_at)}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{bal ? <StatusBadge status={bal.collectionStatus} /> : "—"}</td>
                    <td className="num">{formatINR(r.total_paise)}</td>
                    <td className="num">{bal ? formatINR(bal.amountDuePaise) : "—"}</td>
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
