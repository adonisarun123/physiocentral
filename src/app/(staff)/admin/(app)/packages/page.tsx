import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, EmptyState } from "@/components/ui";
import { PackageProgress } from "@/components/admin/package-progress";
import { listPackages } from "@/modules/scheduling/packages";
import { displayPhone, formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Packages" };

const VIEWS = [
  { key: "active", label: "Running" },
  { key: "finished", label: "Finished / expired / closed" },
  { key: "all", label: "All" },
] as const;

/** Patients on a treatment package (7-, 10-, 30-day …) and how far along they are. */
export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const actor = await requireStaff("APPOINTMENT_VIEW");
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? "active";
  const term = (sp.q ?? "").trim();
  const rows = await listPackages(actor.organizationId, { view, term });
  const showContact = can(actor, "PATIENT_CONTACT_VIEW");

  return (
    <>
      <PageHeader title="Packages" lead="Patients who booked a course of daily sessions. Book a package from + New booking, or from the patient's record.">
        {can(actor, "APPOINTMENT_ACCEPT") ? <Link className="btn btn-primary" href="/admin/book?mode=package">+ Book a package</Link> : null}
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <nav aria-label="Package filter" className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <Link key={v.key} href={`/admin/packages?view=${v.key}${term ? `&q=${encodeURIComponent(term)}` : ""}`}
              aria-current={v.key === view ? "page" : undefined}
              className={`btn btn-sm ${v.key === view ? "btn-primary" : "btn-secondary"}`}>{v.label}</Link>
          ))}
        </nav>
        <form className="flex items-end gap-2" role="search" action="/admin/packages">
          <input type="hidden" name="view" value={view} />
          <div><label htmlFor="pkq" className="field-label">Patient name or ref</label><input id="pkq" name="q" defaultValue={term} className="input" /></div>
          <button className="btn btn-secondary">Search</button>
        </form>
      </div>
      {!rows.length ? <EmptyState>{view === "active" ? "No running packages." : "No packages found."}</EmptyState> : (
        <div className="table-region" role="region" aria-label="Packages" tabIndex={0}>
          <table className="data">
            <thead><tr><th>Patient</th><th>Package</th><th>Progress</th><th>Next session</th><th>Dates</th></tr></thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id}>
                  <td>{showContact ? <Link href={`/admin/patients/${k.patient_id}`} className="font-semibold">{k.patient}</Link> : <span className="font-semibold">{k.patient}</span>}
                    <span className="block text-xs text-[var(--color-ink-muted)]">{k.patient_ref}{showContact && k.phone ? ` · ${displayPhone(k.phone)}` : ""}</span></td>
                  <td><Link href={`/admin/packages/${k.id}`} className="font-semibold">{k.name}</Link><span className="block font-mono text-xs">{k.public_ref}{k.status === "CLOSED" ? " · closed" : k.expired ? " · expired" : ""}</span></td>
                  <td><PackageProgress total={k.sessions_total} done={k.done} booked={k.upcoming} missed={k.no_show} validUntil={k.valid_until} expired={k.expired} /></td>
                  <td>{k.next_at ? formatDateTime(k.next_at) : "—"}</td>
                  <td className="text-sm">{k.first_at ? `${formatDate(k.first_at)} → ${formatDate(k.last_at!)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
