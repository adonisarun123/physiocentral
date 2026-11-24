import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/modules/auth/session";
import { PageHeader, StatusBadge, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatDate, formatDateTime, patientNumber } from "@/lib/format";
import { getEpisode } from "@/modules/clinical/read";
import { sideLabel } from "@/modules/clinical/constants";
import { GoalList, MeasurementForm, PlanForm, SeriesTable, SignedNote } from "@/components/clinical/parts";
import { dischargeEpisodeAction } from "@/app/(staff)/admin/clinical-actions";
import { orDeny } from "../../load";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Episode of care" };

const day = (d: string) => formatDate(`${d}T12:00:00+05:30`);

export default async function EpisodePage({ params }: { params: Promise<{ patientId: string; episodeId: string }> }) {
  const actor = await requireStaff("CLINICAL_NOTES_READ");
  const { patientId, episodeId } = await params;
  const d = await orDeny(getEpisode(actor, episodeId));
  if (d.patient.id !== patientId) notFound();
  const e = d.episode;
  const isOpen = e.status === "OPEN";
  const canWrite = d.canWrite && isOpen;
  const ctx = { patientId: d.patient.id, episodeId: e.id };
  const plan = d.plan[0] ?? null;
  return (
    <>
      <p className="mb-2 text-sm"><Link href={`/admin/chart/${d.patient.id}`}>← {d.patient.full_name} · clinical record</Link></p>
      <PageHeader title={e.title} lead={<><span className="font-mono">{patientNumber(d.patient)}</span> · {d.patient.full_name}{e.body_region ? ` · ${e.side ? sideLabel(e.side) + " " : ""}${e.body_region.toLowerCase()}` : ""} · since {day(e.opened_on)}{e.lead ? ` · lead ${e.lead}` : ""}</>}>
        <StatusBadge status={e.status} />
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className="card"><p className="text-sm text-[var(--color-ink-muted)]">Visits attended</p><p className="text-2xl font-bold">{d.attendance.completed}</p></div>
        <div className="card"><p className="text-sm text-[var(--color-ink-muted)]">Missed / cancelled</p><p className="text-2xl font-bold">{d.attendance.missed} / {d.attendance.cancelled}</p></div>
        <div className="card"><p className="text-sm text-[var(--color-ink-muted)]">Goals achieved</p><p className="text-2xl font-bold">{d.goals.filter((g) => g.status === "ACHIEVED").length} of {d.goals.length}</p></div>
        <div className="card"><p className="text-sm text-[var(--color-ink-muted)]">Next reassessment</p><p className="text-xl font-bold">{plan?.next_reassessment_on ? day(plan.next_reassessment_on) : "Not set"}</p></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card" aria-labelledby="sum-h">
          <h2 id="sum-h" className="text-lg font-bold">Summary</h2>
          <dl className="mt-2 space-y-2">
            <div><dt className="text-sm font-semibold text-[var(--color-ink-muted)]">Working diagnosis</dt><dd className="whitespace-pre-line">{e.working_diagnosis ?? "—"}</dd></div>
            {e.referrer ? <div><dt className="text-sm font-semibold text-[var(--color-ink-muted)]">Referred by</dt><dd>{e.referrer}</dd></div> : null}
            {e.legacy_summary ? <div><dt className="text-sm font-semibold text-[var(--color-ink-muted)]">Earlier record (attached after review by {e.legacy_reviewed_by})</dt><dd className="whitespace-pre-line">{e.legacy_summary}</dd></div> : null}
            {e.discharge_summary ? <div><dt className="text-sm font-semibold text-[var(--color-ink-muted)]">Discharge summary ({day(e.closed_on!)})</dt><dd className="whitespace-pre-line">{e.discharge_summary}</dd></div> : null}
          </dl>
        </section>

        <section className="card" aria-labelledby="plan-h">
          <h2 id="plan-h" className="text-lg font-bold">Treatment plan</h2>
          {plan ? (
            <dl className="mt-2 space-y-1">
              <div><dt className="inline font-semibold">Frequency: </dt><dd className="inline">{plan.frequency ?? "—"}</dd></div>
              <div><dt className="inline font-semibold">Interventions: </dt><dd className="inline whitespace-pre-line">{plan.interventions ?? "—"}</dd></div>
              <div className="text-sm text-[var(--color-ink-muted)]">Set by {plan.author_name}, {formatDateTime(plan.created_at)}{d.plan.length > 1 ? ` · ${d.plan.length - 1} earlier version${d.plan.length > 2 ? "s" : ""} kept` : ""}</div>
            </dl>
          ) : <p className="mt-2 text-sm text-[var(--color-ink-muted)]">No plan recorded yet.</p>}
          {canWrite ? <details className="mt-3"><summary className="cursor-pointer font-semibold">Update the plan</summary><div className="mt-2"><PlanForm ctx={ctx} current={plan} /></div></details> : null}
        </section>

        <section className="card" aria-labelledby="goal-h">
          <h2 id="goal-h" className="text-lg font-bold">Functional goals</h2>
          <div className="mt-2"><GoalList goals={d.goals} ctx={ctx} canWrite={canWrite} /></div>
        </section>

        <section className="card" aria-labelledby="meas-h">
          <h2 id="meas-h" className="text-lg font-bold">Measurements and progress</h2>
          <p className="text-sm text-[var(--color-ink-muted)]">Only the same region, side, movement and scale are compared. Missing follow-ups show as missing.</p>
          <div className="mt-2"><SeriesTable series={d.series} ctx={ctx} canWrite={canWrite} myName={actor.displayName} /></div>
          {canWrite ? <details className="mt-3"><summary className="cursor-pointer font-semibold">Record a measurement</summary><div className="mt-2"><MeasurementForm ctx={ctx} region={e.body_region} side={e.side} /></div></details> : null}
        </section>

        <section className="card xl:col-span-2" aria-labelledby="notes-h">
          <h2 id="notes-h" className="text-lg font-bold">Session notes</h2>
          {d.notes.length === 0 ? <p className="mt-2 text-sm text-[var(--color-ink-muted)]">No notes yet. Notes are written from the appointment, in its Treatment section.</p> : null}
          <div className="mt-2 grid gap-3">{d.notes.map((n) => (
            <div key={n.id}>
              <SignedNote n={n} ctx={ctx} canAddend={d.canWrite} heading={`${formatDate(n.visit_at, n.timezone)} · ${n.service}`} review={{ canReview: d.canReview, myStaffId: d.myStaffId }} />
              <p className="mt-1 text-sm"><Link href={`/admin/appointments/${n.appointment_id}`}>Open visit</Link></p>
            </div>
          ))}</div>
        </section>

        {canWrite ? (
          <section className="card xl:col-span-2" aria-labelledby="dis-h">
            <h2 id="dis-h" className="text-lg font-bold">Discharge</h2>
            <details className="mt-2"><summary className="btn btn-secondary btn-sm">Discharge this episode…</summary>
              <ActionForm action={dischargeEpisodeAction} className="mt-3 grid max-w-2xl gap-2" confirm="Discharge this episode? Goals, plan and measurements can no longer be added.">
                <input type="hidden" name="patientId" value={d.patient.id} /><input type="hidden" name="episodeId" value={e.id} />
                <label className="field-label" htmlFor="ds-s">Discharge summary (outcome, remaining limitations, follow-up advice)</label>
                <textarea id="ds-s" name="summary" required minLength={5} maxLength={4000} rows={4} className="input" />
                <label className="field-label" htmlFor="ds-d">Discharge date (defaults to today)</label>
                <input id="ds-d" name="closedOn" type="date" className="input max-w-xs" />
                <div><SubmitButton small variant="danger">Discharge</SubmitButton></div>
              </ActionForm>
            </details>
          </section>
        ) : !isOpen ? <div className="xl:col-span-2"><Notice>This episode is discharged. Signed notes can still receive addenda.</Notice></div> : null}
      </div>
    </>
  );
}
