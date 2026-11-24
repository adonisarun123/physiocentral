import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/modules/auth/session";
import { PageHeader, EmptyState } from "@/components/ui";
import { formatINR } from "@/modules/billing/money";
import { todayInZone } from "@/lib/format";
import { loadReportTables } from "@/modules/reports";
import { presets, resolveRange, resolveView, type ReportView } from "@/modules/reports/range";
import type { Table } from "@/modules/reports/tables";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports" };

const VIEWS: { id: ReportView; label: string }[] = [
  { id: "day", label: "Day-wise" },
  { id: "user", label: "User-wise" },
  { id: "service", label: "Service-wise" },
];

const NOTES: Record<ReportView, string> = {
  day: "Visits are counted on the appointment date. Billed = issued bills on their issue date (voided bills left out). Collected = verified payments on the date received. Refunds count on the day the money went back.",
  user: "Physiotherapist figures come from appointments assigned to them; a bill counts towards a physio only when it was raised from their visit. Staff figures show who made bookings, recorded and verified payments, issued bills and approved refunds.",
  service: "Visits are counted on the appointment date; billing comes from issued bill lines on their issue date. Charges added without a service (e.g. packages typed in by hand) appear under “Other charges”.",
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ view?: string; from?: string; to?: string }> }) {
  const actor = await requireStaff("FINANCE_VIEW");
  const sp = await searchParams;
  const today = todayInZone();
  const view = resolveView(sp.view);
  const { from, to } = resolveRange(sp.from, sp.to, today);
  const tables = await loadReportTables(actor, view, from, to, (p) => formatINR(p));
  const qs = (o: Record<string, string>) => new URLSearchParams({ view, from, to, ...o }).toString();

  return (
    <>
      <PageHeader title="Reports" lead={`${from === to ? from : `${from} to ${to}`} · clinic time (IST)`}>
        <a href={`/admin/reports/export?${qs({})}`} className="btn btn-secondary" download>Download CSV</a>
      </PageHeader>

      <nav aria-label="Report type" className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link key={v.id} href={`/admin/reports?${qs({ view: v.id })}`} aria-current={v.id === view ? "page" : undefined}
            className={`btn ${v.id === view ? "btn-primary" : "btn-secondary"}`}>{v.label}</Link>
        ))}
      </nav>

      <div className="card mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="view" value={view} />
          <label className="flex flex-col text-sm font-medium">From<input type="date" name="from" defaultValue={from} max={today} className="input" /></label>
          <label className="flex flex-col text-sm font-medium">To<input type="date" name="to" defaultValue={to} max={today} className="input" /></label>
          <button type="submit" className="btn btn-primary">Show</button>
        </form>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {presets(today).map((p) => (
            <Link key={p.label} href={`/admin/reports?${qs({ from: p.from, to: p.to })}`}>{p.label}</Link>
          ))}
        </p>
      </div>

      {tables.map((t) => <ReportTable key={t.title} table={t} />)}
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{NOTES[view]}</p>
    </>
  );
}

function ReportTable({ table }: { table: Table }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xl font-bold">{table.title}</h2>
      {table.rows.length === 0 ? <EmptyState>Nothing recorded in this period.</EmptyState> : (
        <div className="card table-region" role="region" aria-label={table.title} tabIndex={0}>
          <table className="data">
            <thead><tr>{table.header.map((h, i) => <th key={h} className={table.numeric[i] ? "num" : undefined}>{h}</th>)}</tr></thead>
            <tbody>
              {table.rows.map((r, ri) => (
                <tr key={ri}>{r.map((c, i) => <td key={i} className={table.numeric[i] ? "num" : undefined}>{c}</td>)}</tr>
              ))}
            </tbody>
            {table.totals ? (
              <tfoot><tr className="font-bold">{table.totals.map((c, i) => <td key={i} className={table.numeric[i] ? "num" : undefined}>{c}</td>)}</tr></tfoot>
            ) : null}
          </table>
        </div>
      )}
    </section>
  );
}
