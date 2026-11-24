import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, EmptyState } from "@/components/ui";
import { formatDateTime, patientNumber } from "@/lib/format";
import { AUDIT_CATEGORIES, actionLabel, auditStaffOptions, listAuditEvents } from "@/modules/audit/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit history" };

type SP = Promise<{ category?: string; staff?: string; from?: string; to?: string; patient?: string }>;

export default async function AuditPage({ searchParams }: { searchParams: SP }) {
  const actor = await requireStaff("AUDIT_VIEW");
  const sp = await searchParams;
  const category = sp.category ?? "clinical";
  const [rows, staff] = await Promise.all([
    listAuditEvents(actor, { category, staffId: sp.staff, from: sp.from, to: sp.to, patientId: sp.patient }),
    auditStaffOptions(actor),
  ]);
  const canPatient = can(actor, "PATIENT_CONTACT_VIEW");
  return (
    <>
      <PageHeader title="Audit history" lead="Who opened or changed what, and when. Clinical content is never stored here, only the action." />
      <form className="card mb-6 grid gap-3 sm:grid-cols-5 sm:items-end" method="get">
        <div className="sm:col-span-2"><label className="field-label" htmlFor="au-c">Show</label>
          <select id="au-c" name="category" defaultValue={category} className="input">{AUDIT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
        <div><label className="field-label" htmlFor="au-s">Staff member</label>
          <select id="au-s" name="staff" defaultValue={sp.staff ?? ""} className="input"><option value="">Anyone</option>{staff.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></div>
        <div><label className="field-label" htmlFor="au-f">From</label><input id="au-f" name="from" type="date" defaultValue={sp.from ?? ""} className="input" /></div>
        <div><label className="field-label" htmlFor="au-t">To</label><input id="au-t" name="to" type="date" defaultValue={sp.to ?? ""} className="input" /></div>
        {sp.patient ? <input type="hidden" name="patient" value={sp.patient} /> : null}
        <div className="sm:col-span-5 flex flex-wrap gap-2"><button type="submit" className="btn btn-primary btn-sm">Filter</button>
          {sp.patient ? <Link href={`/admin/audit?category=${category}`} className="btn btn-secondary btn-sm">Clear patient filter</Link> : null}</div>
      </form>
      {rows.length === 0 ? <EmptyState>No matching events.</EmptyState> : (
        <section className="card">
          <p className="text-sm text-[var(--color-ink-muted)]">Latest {rows.length} events{rows.length === 300 ? " (narrow the dates to see older ones)" : ""}.</p>
          <div className="table-region" role="region" tabIndex={0} aria-label="Audit events">
            <table className="data mt-2 text-sm">
              <thead><tr><th>When</th><th>Who</th><th>What</th><th>Patient</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                  <td>{r.actor_name ?? r.actor.split(":")[0]}</td>
                  <td>{actionLabel(r.action)}{r.reason ? <span className="block text-[var(--color-ink-muted)]">{r.reason}</span> : null}</td>
                  <td>{r.patient_id ? <>
                    {canPatient ? <Link href={`/admin/patients/${r.patient_id}`}>{r.patient}</Link> : r.patient}
                    {r.public_ref ? <span className="ml-1 font-mono text-xs">{patientNumber({ op_number: r.op_number, public_ref: r.public_ref })}</span> : null}
                    {" "}<Link href={`/admin/audit?category=all&patient=${r.patient_id}`} className="text-xs">all activity</Link></> : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
