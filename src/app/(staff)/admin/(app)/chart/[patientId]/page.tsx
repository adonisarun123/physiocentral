import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, StatusBadge, Notice } from "@/components/ui";
import { formatDate, formatDateTime, patientNumber } from "@/lib/format";
import { getChart } from "@/modules/clinical/read";
import { sideLabel } from "@/modules/clinical/constants";
import { sexLabel } from "@/modules/patients/admin";
import { IntakeForm, NewEpisodeForm } from "@/components/clinical/parts";
import { orDeny } from "./load";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Clinical record", robots: { index: false, follow: false } };

const day = (d: string) => formatDate(`${d}T12:00:00+05:30`);

export default async function ChartPage({ params }: { params: Promise<{ patientId: string }> }) {
  const actor = await requireStaff("CLINICAL_NOTES_READ");
  const { patientId } = await params;
  const c = await orDeny(getChart(actor, patientId));
  const canWrite = can(actor, "CLINICAL_NOTES_WRITE");
  const open = c.episodes.filter((e) => e.status === "OPEN");
  const closed = c.episodes.filter((e) => e.status !== "OPEN");
  const hasLegacy = !!(c.legacy.diagnosis || c.legacy.treatment_protocol);
  const ctx = { patientId: c.patient.id };
  return (
    <>
      <PageHeader title={c.patient.full_name} lead={<><span className="font-mono font-semibold">{patientNumber(c.patient)}</span>{c.legacy.age != null || c.legacy.sex ? ` · ${[c.legacy.age != null ? `${c.legacy.age} yrs` : null, sexLabel(c.legacy.sex)].filter(Boolean).join(", ")}` : ""} · Clinical record</>}>
        {can(actor, "PATIENT_CONTACT_VIEW") ? <Link href={`/admin/patients/${c.patient.id}`} className="btn btn-secondary btn-sm">Contact &amp; billing</Link> : null}
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card" aria-labelledby="ep-h">
          <h2 id="ep-h" className="text-lg font-bold">Episodes of care</h2>
          <p className="text-sm text-[var(--color-ink-muted)]">Each problem is tracked separately under the same OP number.</p>
          {c.episodes.length === 0 ? <p className="mt-2">No episodes yet.</p> : null}
          <ul className="mt-2 divide-y divide-[var(--color-line)]">
            {[...open, ...closed].map((e) => (
              <li key={e.id} className="py-3">
                <Link href={`/admin/chart/${c.patient.id}/episodes/${e.id}`} className="font-semibold">{e.title}</Link> <StatusBadge status={e.status} />
                <span className="block text-sm text-[var(--color-ink-muted)]">
                  {[e.body_region ? `${e.side ? sideLabel(e.side) + " " : ""}${e.body_region.toLowerCase()}` : null, `since ${day(e.opened_on)}`, e.closed_on ? `discharged ${day(e.closed_on)}` : null,
                    `${e.visits} visit${e.visits === 1 ? "" : "s"}`, `${e.signed_notes} signed note${e.signed_notes === 1 ? "" : "s"}`,
                    e.next_reassessment_on && e.status === "OPEN" ? `reassess ${day(e.next_reassessment_on)}` : null, e.lead ? `lead ${e.lead}` : null].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          {canWrite ? (
            <details className="mt-3" open={c.episodes.length === 0}><summary className="btn btn-primary btn-sm">Start a new episode</summary>
              <div className="mt-3"><NewEpisodeForm ctx={ctx} hasLegacy={hasLegacy} /></div>
            </details>
          ) : null}
        </section>

        <section className="card" aria-labelledby="hist-h">
          <h2 id="hist-h" className="text-lg font-bold">Before episodes (historical)</h2>
          {hasLegacy ? (
            <>
              <Notice>Recorded on the registration form before episodes of care existed. Review it, then attach it to the right episode when you start one.</Notice>
              <dl className="mt-3 space-y-2">
                {c.legacy.diagnosis ? <div><dt className="text-sm font-semibold text-[var(--color-ink-muted)]">Diagnosis</dt><dd className="whitespace-pre-line">{c.legacy.diagnosis}</dd></div> : null}
                {c.legacy.treatment_protocol ? <div><dt className="text-sm font-semibold text-[var(--color-ink-muted)]">Treatment protocol</dt><dd className="whitespace-pre-line">{c.legacy.treatment_protocol}</dd></div> : null}
              </dl>
            </>
          ) : <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Nothing recorded before episodes.</p>}
        </section>

        <section className="card xl:col-span-2" aria-labelledby="in-h">
          <h2 id="in-h" className="text-lg font-bold">Intake</h2>
          {c.intakes.length === 0 ? <p className="mt-2 text-sm text-[var(--color-ink-muted)]">No intake form yet.</p> : (
            <ul className="mt-2 grid gap-3 md:grid-cols-2">{c.intakes.map((i) => (
              <li key={i.id} className="rounded-lg border border-[var(--color-line)] p-3">
                <p className="text-sm text-[var(--color-ink-muted)]">{formatDateTime(i.created_at)} · {i.channel === "RECEPTION" ? "at reception" : "by the patient"}{i.episode_title ? ` · ${i.episode_title}` : ""} · treatment consent {i.treatment_consent ? "given" : <strong>not given</strong>}</p>
                <p className="mt-1"><span className="font-semibold">Concern:</span> {i.main_concern}</p>
                {i.relevant_history ? <p className="whitespace-pre-line"><span className="font-semibold">History:</span> {i.relevant_history}</p> : null}
                {i.patient_goal ? <p><span className="font-semibold">Goal:</span> {i.patient_goal}</p> : null}
                {i.referrer || i.preferred_language ? <p className="text-sm">{[i.referrer ? `Referred by ${i.referrer}` : null, i.preferred_language ? `Prefers ${i.preferred_language}` : null].filter(Boolean).join(" · ")}</p> : null}
              </li>))}</ul>
          )}
          {canWrite ? (
            <details className="mt-3"><summary className="cursor-pointer font-semibold">Record an intake</summary>
              <div className="mt-2"><IntakeForm ctx={ctx} episodes={open} idPrefix="chin" /></div></details>
          ) : null}
        </section>

        <section className="card xl:col-span-2" aria-labelledby="v-h">
          <h2 id="v-h" className="text-lg font-bold">Visits</h2>
          <ul className="mt-2 divide-y divide-[var(--color-line)]">{c.visits.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><Link href={`/admin/appointments/${v.id}`} className="font-semibold">{formatDateTime(v.starts_at, v.timezone)}</Link> · {v.service}{v.therapist ? ` · ${v.therapist}` : ""}
                <span className="block text-xs text-[var(--color-ink-muted)]">{v.episode_id ? c.episodes.find((e) => e.id === v.episode_id)?.title : "Not filed under an episode"}</span></span>
              <StatusBadge status={v.status} />
            </li>))}</ul>
        </section>
      </div>
    </>
  );
}
