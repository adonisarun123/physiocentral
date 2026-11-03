import Link from "next/link";
import { q1, q } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, StatusBadge } from "@/components/ui";
import { formatINR } from "@/modules/billing/money";
import { formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const actor = await requireStaff();
  const org = actor.organizationId;
  const [pending, oldest, today, unpaid, pendingPay, outbox] = await Promise.all([
    q1<{ n: string }>(`SELECT count(*) n FROM appointment WHERE organization_id=$1 AND status='REQUESTED'`, [org]),
    q1<{ hours: number | null }>(`SELECT round(extract(epoch FROM now() - min(created_at)) / 3600)::int AS hours FROM appointment WHERE organization_id=$1 AND status='REQUESTED'`, [org]),
    q<{ id: string; starts_at: Date; status: string; patient: string; service: string; therapist: string | null }>(
      `SELECT a.id, a.starts_at, a.status, p.full_name patient, s.name service, t.display_name therapist
         FROM appointment a JOIN patient p ON p.id=a.patient_id JOIN service s ON s.id=a.service_id LEFT JOIN therapist t ON t.id=a.therapist_id
        WHERE a.organization_id=$1 AND a.status IN ('CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW')
          AND (a.starts_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
        ORDER BY a.starts_at`, [org]),
    can(actor, "FINANCE_VIEW") || can(actor, "INVOICE_DRAFT")
      ? q1<{ n: string; due: string }>(`SELECT count(*) n, COALESCE(sum(amount_due_paise),0)::text due FROM invoice_balance WHERE organization_id=$1 AND amount_due_paise > 0`, [org])
      : Promise.resolve(undefined),
    can(actor, "PAYMENT_VERIFY") || can(actor, "PAYMENT_RECORD")
      ? q1<{ n: string }>(`SELECT count(*) n FROM payment WHERE organization_id=$1 AND status='PENDING'`, [org])
      : Promise.resolve(undefined),
    q1<{ n: string }>(`SELECT count(*) n FROM outbox_event WHERE status='PENDING'`),
  ]);
  const oldestH = oldest?.hours ?? null;

  return (
    <>
      <PageHeader title="Dashboard" lead={`Welcome, ${actor.displayName}.`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/admin/requests" className="card no-underline">
          <p className="text-sm font-semibold text-[var(--color-ink-muted)]">Pending requests</p>
          <p className="text-3xl font-extrabold">{pending?.n ?? 0}</p>
          {oldestH !== null ? <p className="text-sm">Oldest waiting {oldestH} h</p> : null}
        </Link>
        <div className="card"><p className="text-sm font-semibold text-[var(--color-ink-muted)]">Today&apos;s visits</p><p className="text-3xl font-extrabold">{today.length}</p></div>
        {unpaid ? (
          <Link href="/admin/invoices" className="card no-underline">
            <p className="text-sm font-semibold text-[var(--color-ink-muted)]">Unpaid balances</p>
            <p className="text-3xl font-extrabold">{formatINR(unpaid.due)}</p>
            <p className="text-sm">{unpaid.n} invoice(s)</p>
          </Link>
        ) : null}
        {pendingPay ? (
          <Link href="/admin/payments" className="card no-underline">
            <p className="text-sm font-semibold text-[var(--color-ink-muted)]">Payments awaiting verification</p>
            <p className="text-3xl font-extrabold">{pendingPay.n}</p>
          </Link>
        ) : null}
      </div>
      <section className="mt-8">
        <h2 className="mb-3 text-xl font-bold">Today</h2>
        {today.length === 0 ? <p className="card text-[var(--color-ink-muted)]">No confirmed visits today.</p> : (
          <ul className="space-y-2">
            {today.map((a) => (
              <li key={a.id} className="card flex flex-wrap items-center justify-between gap-2">
                <span><strong>{formatTime(a.starts_at)}</strong> · <Link href={`/admin/appointments/${a.id}`}>{a.patient}</Link> · {a.service} · {a.therapist ?? "Unassigned"}</span>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-8 text-sm text-[var(--color-ink-muted)]">
        Notifications queued: {outbox?.n ?? 0}. Email/SMS/WhatsApp delivery is not connected yet — patients see their reference and secure link on screen; contact them by phone to confirm.
      </p>
    </>
  );
}
