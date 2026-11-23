import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/modules/auth/session";
import { PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { getClinicalOverview } from "@/modules/clinical/overview";
import { orDeny } from "../chart/[patientId]/load";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Clinical overview" };

const day = (d: string) => formatDate(`${d}T12:00:00+05:30`);

function Section({ id, title, count, help, children }: { id: string; title: string; count: number; help: string; children: React.ReactNode }) {
  return (
    <section className="card" aria-labelledby={id}>
      <h2 id={id} className="text-lg font-bold">{title} <span className="ml-1 rounded-full bg-[var(--color-surface-alt)] px-2 text-base">{count}</span></h2>
      <p className="text-sm text-[var(--color-ink-muted)]">{help}</p>
      <div className="mt-2">{count ? children : <p className="text-sm text-[var(--color-ink-muted)]">Nothing here.</p>}</div>
    </section>
  );
}

export default async function ClinicalOverviewPage() {
  const actor = await requireStaff("CLINICAL_RECORDS_ALL");
  const o = await orDeny(getClinicalOverview(actor));
  const stale = o.drafts.filter((d) => d.stale);
  return (
    <>
      <PageHeader title="Clinical overview" lead="Across every physiotherapist's caseload. Open a patient's record from any row." />

      <section className="card mb-6" aria-labelledby="cl-h">
        <h2 id="cl-h" className="text-lg font-bold">Caseload by physiotherapist</h2>
        <div className="table-region" role="region" tabIndex={0} aria-label="Caseload by physiotherapist">
          <table className="data mt-2">
            <thead><tr><th>Physiotherapist</th><th className="num">Open episodes (lead)</th><th className="num">Unsigned drafts</th><th className="num">Notes signed, last 30 days</th></tr></thead>
            <tbody>{o.caseload.map((t) => (
              <tr key={t.therapist_id}><td>{t.therapist}</td><td className="num">{t.open_episodes}</td><td className={`num ${t.drafts ? "font-bold" : ""}`}>{t.drafts}</td><td className="num">{t.signed_30d}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section id="ud-h" title="Completed visits with no note" count={o.undocumented.length} help="Last 30 days. Each completed visit should have a signed note.">
          <ul className="divide-y divide-[var(--color-line)]">{o.undocumented.map((v) => (
            <li key={v.appointment_id} className="py-2"><Link href={`/admin/appointments/${v.appointment_id}`} className="font-semibold">{v.patient}</Link> · {formatDateTime(v.starts_at, v.timezone)} · {v.therapist ?? "no therapist"}</li>
          ))}</ul>
        </Section>

        <Section id="dr-h" title="Unsigned drafts" count={o.drafts.length} help={`${stale.length} are more than a day past the visit.`}>
          <ul className="divide-y divide-[var(--color-line)]">{o.drafts.map((d) => (
            <li key={d.note_id} className="py-2"><Link href={`/admin/appointments/${d.appointment_id}`} className="font-semibold">{d.patient}</Link> · {formatDateTime(d.starts_at, d.timezone)} · {d.author_name}
              {d.stale ? <span className="ml-2 text-sm font-semibold text-[var(--color-danger)]">overdue</span> : null}</li>
          ))}</ul>
        </Section>

        <Section id="re-h" title="Reassessments due" count={o.overdue.length} help="Open episodes whose planned reassessment date is today or earlier.">
          <ul className="divide-y divide-[var(--color-line)]">{o.overdue.map((e) => (
            <li key={e.episode_id} className="py-2"><Link href={`/admin/chart/${e.patient_id}/episodes/${e.episode_id}`} className="font-semibold">{e.patient}</Link> · {e.title} · due {day(e.due)}{e.lead ? ` · ${e.lead}` : ""}</li>
          ))}</ul>
        </Section>

        <Section id="nv-h" title="Open episodes with no next visit" count={o.noNextVisit.length} help="In treatment, but nothing booked. Rebook or discharge.">
          <ul className="divide-y divide-[var(--color-line)]">{o.noNextVisit.map((e) => (
            <li key={e.episode_id} className="py-2"><Link href={`/admin/chart/${e.patient_id}/episodes/${e.episode_id}`} className="font-semibold">{e.patient}</Link> · {e.title} · last seen {e.last_visit ? formatDate(e.last_visit) : "never"}{e.lead ? ` · ${e.lead}` : ""}</li>
          ))}</ul>
        </Section>

        <Section id="rv-h" title="Signed notes to countersign" count={o.toReview.length} help="Colleagues' notes signed in the last 30 days that you haven't countersigned.">
          <ul className="divide-y divide-[var(--color-line)]">{o.toReview.map((n) => (
            <li key={n.note_id} className="py-2"><Link href={`/admin/appointments/${n.appointment_id}`} className="font-semibold">{n.patient}</Link> · {n.author_name} · signed {formatDateTime(n.signed_at)}</li>
          ))}</ul>
        </Section>
      </div>
    </>
  );
}
