import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, StatusBadge, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PackageProgress } from "@/components/admin/package-progress";
import { getPackage, packageSessions } from "@/modules/scheduling/packages";
import { formatINR } from "@/modules/billing/money";
import { displayPhone, formatDateTime } from "@/lib/format";
import { packageStatusAction } from "../../../actions";
import { packageValidityAction } from "../../../ops-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Package" };

export default async function PackagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ booked?: string; short?: string }> }) {
  const actor = await requireStaff("APPOINTMENT_VIEW");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const k = await getPackage(actor.organizationId, id);
  if (!k) notFound();
  const sessions = await packageSessions(k.id);
  const used = k.done + k.upcoming + k.no_show;
  const left = Math.max(0, k.sessions_total - used);
  const showContact = can(actor, "PATIENT_CONTACT_VIEW");
  const short = Number(sp.short) || 0;
  const bill = new URLSearchParams({ patient: k.patient_id, desc: `${k.name} (${k.public_ref})`, ...(k.price_paise ? { price: (Number(k.price_paise) / 100).toFixed(2) } : {}) });

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/packages">← Packages</Link></p>
      <PageHeader title={k.name} lead={<>
        {showContact ? <Link href={`/admin/patients/${k.patient_id}`} className="font-semibold">{k.patient}</Link> : <span className="font-semibold">{k.patient}</span>}
        {showContact && k.phone ? ` · ${displayPhone(k.phone)}` : ""} · <span className="font-mono">{k.public_ref}</span>
        {k.price_paise ? ` · ${formatINR(k.price_paise)}` : ""}{k.status === "CLOSED" ? " · closed" : ""}</>}>
        {can(actor, "APPOINTMENT_ACCEPT") && k.status === "ACTIVE" && left > 0 && !k.expired
          ? <Link href={`/admin/book?patient=${k.patient_id}&package=${k.id}`} className="btn btn-primary">Book a remaining session</Link> : null}
        {can(actor, "INVOICE_DRAFT") ? <Link href={`/admin/invoices/new?${bill.toString()}`} className="btn btn-secondary">Bill this package</Link> : null}
      </PageHeader>

      {sp.booked ? (
        <div className="mb-4">
          {short
            ? <Notice tone="warn" title="Package booked, with gaps">{short} session(s) could not be placed at this time in the next few weeks (leave, holidays or clashes). Use &quot;Book a remaining session&quot; to add them at another time.</Notice>
            : <Notice tone="ok">All {k.sessions_total} sessions are booked.</Notice>}
        </div>
      ) : null}

      {k.expired && k.status === "ACTIVE" && k.done + k.no_show < k.sessions_total ? (
        <div className="mb-4"><Notice tone="warn" title="Package expired">
          {k.sessions_total - k.done - k.no_show} session(s) were not used before {k.valid_until}. Booked visits after that date can&apos;t be checked in until you extend the validity below.
        </Notice></div>
      ) : null}

      <section className="card mb-6"><PackageProgress total={k.sessions_total} done={k.done} booked={k.upcoming} missed={k.no_show} validUntil={k.valid_until} expired={k.expired} />
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">A session is used up when the patient checks in (or misses it). Visits in a package are not charged one by one; bill the package once with &quot;Bill this package&quot;. Cancelling a visit frees its place so it can be rebooked.</p>
        {can(actor, "APPOINTMENT_ACCEPT") ? (
          <details className="mt-3"><summary className="cursor-pointer font-semibold">{k.valid_until ? "Change validity" : "Set an expiry date"}</summary>
            <ActionForm action={packageValidityAction} className="mt-2 flex flex-wrap items-end gap-3">
              <input type="hidden" name="packageId" value={k.id} />
              <div><label className="field-label" htmlFor="pv-d">Valid until</label><input id="pv-d" name="validUntil" type="date" defaultValue={k.valid_until ?? ""} className="input" /></div>
              <div className="min-w-64 flex-1"><label className="field-label" htmlFor="pv-r">Reason</label><input id="pv-r" name="reason" required minLength={3} maxLength={300} className="input" placeholder="e.g. patient was unwell for a week" /></div>
              <SubmitButton small>Save</SubmitButton>
            </ActionForm>
            <p className="field-hint mt-1">Clear the date to remove the expiry. The change and reason are logged.</p>
          </details>
        ) : null}
      </section>

      <section className="card">
        <h2 className="text-lg font-bold">Sessions</h2>
        <ul className="mt-2 divide-y divide-[var(--color-line)]">
          {sessions.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{a.n ? <span className="mr-2 inline-block min-w-14 font-semibold">Day {a.n}</span> : <span className="mr-2 inline-block min-w-14 text-[var(--color-ink-muted)]">—</span>}
                <Link href={`/admin/appointments/${a.id}`}>{formatDateTime(a.starts_at)}</Link>{a.therapist ? ` · ${a.therapist}` : ""}</span>
              <StatusBadge status={a.status} />
            </li>
          ))}
          {!sessions.length ? <li className="py-2 text-sm text-[var(--color-ink-muted)]">No sessions booked.</li> : null}
        </ul>
      </section>

      {can(actor, "APPOINTMENT_ACCEPT") ? (
        <section className="mt-6">
          <ActionForm action={packageStatusAction} confirm={k.status === "ACTIVE" ? "Close this package? Booked future sessions stay on the calendar; cancel them individually if needed." : undefined}>
            <input type="hidden" name="packageId" value={k.id} />
            <input type="hidden" name="status" value={k.status === "ACTIVE" ? "CLOSED" : "ACTIVE"} />
            <SubmitButton variant="secondary" small>{k.status === "ACTIVE" ? "Close package (finished early / refunded)" : "Reopen package"}</SubmitButton>
          </ActionForm>
        </section>
      ) : null}
    </>
  );
}
