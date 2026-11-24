import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatINR } from "@/modules/billing/money";
import { formatDate, todayInZone } from "@/lib/format";
import { EXPENSE_CATEGORIES, PAID_VIA, categoryLabel, listExpenses, paidViaLabel } from "@/modules/finance/expenses";
import { presets, resolveRange } from "@/modules/reports/range";
import { recordExpenseAction, voidExpenseAction } from "../../ops-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Expenses" };

const day = (d: string) => formatDate(`${d}T12:00:00+05:30`);

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const actor = await requireStaff("EXPENSE_RECORD");
  const sp = await searchParams;
  const today = todayInZone();
  const { from, to } = resolveRange(sp.from, sp.to, today);
  const rows = await listExpenses(actor, from, to);
  const total = rows.filter((r) => r.status === "RECORDED").reduce((s, r) => s + BigInt(r.amount_paise), 0n);
  const canVoid = can(actor, "FINANCE_VIEW");
  const qs = (o: Record<string, string>) => new URLSearchParams({ from, to, ...o }).toString();

  return (
    <>
      <PageHeader title="Expenses" lead="Money the clinic spends: rent, salaries, consumables and so on. Used for profit in Reports.">
        {can(actor, "FINANCE_VIEW") ? <Link href={`/admin/reports?${qs({ view: "profit" })}`} className="btn btn-secondary">Profit report</Link> : null}
      </PageHeader>

      <section className="card mb-6" aria-labelledby="new-h">
        <h2 id="new-h" className="text-lg font-bold">Record an expense</h2>
        <ActionForm action={recordExpenseAction} className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className="field-label" htmlFor="ex-d">Date paid</label><input id="ex-d" name="spentOn" type="date" required max={today} defaultValue={today} className="input" /></div>
            <div><label className="field-label" htmlFor="ex-a">Amount (₹)</label><input id="ex-a" name="amountRupees" required inputMode="decimal" className="input" /></div>
            <div><label className="field-label" htmlFor="ex-c">Category</label>
              <select id="ex-c" name="category" required className="input" defaultValue="">
                <option value="" disabled>Choose…</option>
                {EXPENSE_CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div><label className="field-label" htmlFor="ex-v">Paid by</label>
              <select id="ex-v" name="paidVia" className="input" defaultValue="CASH">
                {PAID_VIA.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div><label className="field-label" htmlFor="ex-p">Paid to (optional)</label><input id="ex-p" name="payee" maxLength={120} className="input" placeholder="e.g. landlord, BESCOM, supplier" /></div>
            <div><label className="field-label" htmlFor="ex-n">Note</label><input id="ex-n" name="note" maxLength={500} className="input" placeholder="What it was for" /></div>
          </div>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Please don&apos;t type patient names or health details here.</p>
          <div className="mt-3"><SubmitButton>Save expense</SubmitButton></div>
        </ActionForm>
      </section>

      <div className="card mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm font-medium">From<input type="date" name="from" defaultValue={from} max={today} className="input" /></label>
          <label className="flex flex-col text-sm font-medium">To<input type="date" name="to" defaultValue={to} max={today} className="input" /></label>
          <button type="submit" className="btn btn-primary">Show</button>
        </form>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {presets(today).map((p) => <Link key={p.label} href={`/admin/expenses?${new URLSearchParams({ from: p.from, to: p.to })}`}>{p.label}</Link>)}
        </p>
      </div>

      <h2 className="mb-2 text-xl font-bold">{from === to ? day(from) : `${day(from)} to ${day(to)}`} · {formatINR(total)}</h2>
      {rows.length === 0 ? <EmptyState>No expenses recorded in this period.</EmptyState> : (
        <div className="card table-region" role="region" aria-label="Expenses" tabIndex={0}>
          <table className="data">
            <thead><tr><th>Date</th><th>Category</th><th>Paid to / note</th><th>Paid by</th><th>Entered by</th><th className="num">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.status === "VOIDED" ? "opacity-60" : undefined}>
                  <td>{day(r.spent_on)}</td>
                  <td>{categoryLabel(r.category)}</td>
                  <td>{[r.payee, r.note].filter(Boolean).join(" · ") || "—"}
                    {r.void_reason ? <span className="block text-xs">Voided: {r.void_reason}</span> : null}</td>
                  <td>{paidViaLabel(r.paid_via)}</td>
                  <td>{r.recorded_by_name ?? "—"}</td>
                  <td className="num">{r.status === "VOIDED" ? <s>{formatINR(r.amount_paise)}</s> : formatINR(r.amount_paise)}</td>
                  <td>
                    {r.status === "VOIDED" ? <StatusBadge status="VOIDED" /> : canVoid ? (
                      <details><summary className="cursor-pointer text-sm">Void</summary>
                        <ActionForm action={voidExpenseAction} className="mt-2 flex flex-wrap items-end gap-2" confirm="Void this expense? It will stop counting in reports.">
                          <input type="hidden" name="expenseId" value={r.id} />
                          <label className="sr-only" htmlFor={`vr-${r.id}`}>Reason</label>
                          <input id={`vr-${r.id}`} name="reason" required minLength={3} placeholder="Reason, e.g. entered twice" className="input" />
                          <SubmitButton small variant="danger">Void</SubmitButton>
                        </ActionForm></details>
                    ) : "Recorded"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Entries can&apos;t be edited or deleted. If one is wrong, void it with a reason and enter it again.</p>
    </>
  );
}
