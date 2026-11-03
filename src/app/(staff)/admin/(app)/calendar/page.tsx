import Link from "next/link";
import type { Metadata } from "next";
import { q } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { PageHeader, StatusBadge, EmptyState } from "@/components/ui";
import { formatDate, formatTime, todayInZone } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar" };

function shift(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Day agenda grouped by therapist — the keyboard-friendly default on all screens (§4.1). */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const actor = await requireStaff("APPOINTMENT_VIEW");
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayInZone();
  const rows = await q<{ id: string; starts_at: Date; ends_at: Date; status: string; patient: string; service: string; therapist: string | null; branch: string }>(
    `SELECT a.id, a.starts_at, a.ends_at, a.status, split_part(p.full_name, ' ', 1) patient, s.name service, t.display_name therapist, b.name branch
       FROM appointment a JOIN patient p ON p.id=a.patient_id JOIN service s ON s.id=a.service_id JOIN branch b ON b.id=a.branch_id
       LEFT JOIN therapist t ON t.id=a.therapist_id
      WHERE a.organization_id=$1 AND a.status NOT IN ('REJECTED')
        AND a.starts_at >= ($2::date AT TIME ZONE b.timezone) AND a.starts_at < (($2::date + 1) AT TIME ZONE b.timezone)
      ORDER BY t.display_name NULLS LAST, a.starts_at`,
    [actor.organizationId, date],
  );
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.therapist ?? "Unassigned requests", [...(groups.get(r.therapist ?? "Unassigned requests") ?? []), r]);

  return (
    <>
      <PageHeader title="Calendar" lead={formatDate(`${date}T06:00:00Z`)}>
        <Link className="btn btn-secondary btn-sm" href={`/admin/calendar?date=${shift(date, -1)}`}>← Previous day</Link>
        <Link className="btn btn-secondary btn-sm" href="/admin/calendar">Today</Link>
        <Link className="btn btn-secondary btn-sm" href={`/admin/calendar?date=${shift(date, 1)}`}>Next day →</Link>
        <Link className="btn btn-primary btn-sm" href="/admin/book">+ New booking</Link>
      </PageHeader>
      <form className="mb-6 flex items-end gap-2" action="/admin/calendar">
        <div><label htmlFor="date" className="field-label">Go to date</label><input id="date" name="date" type="date" defaultValue={date} className="input" /></div>
        <button className="btn btn-secondary">Show</button>
      </form>
      {rows.length === 0 ? <EmptyState>Nothing scheduled.</EmptyState> : [...groups.entries()].map(([name, list]) => (
        <section key={name} className="mb-6">
          <h2 className="mb-2 text-lg font-bold">{name}</h2>
          <ul className="space-y-2">
            {list.map((a) => (
              <li key={a.id} className="card flex flex-wrap items-center justify-between gap-2 py-3">
                <span><strong>{formatTime(a.starts_at)}–{formatTime(a.ends_at)}</strong> · <Link href={`/admin/appointments/${a.id}`}>{a.patient}</Link> · {a.service} · {a.branch}</span>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
