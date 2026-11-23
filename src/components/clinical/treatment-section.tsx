import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Notice } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { linkEpisodeAction } from "@/app/(staff)/admin/clinical-actions";
import type { getTreatmentPanel } from "@/modules/clinical/read";
import { goalStatusLabel, formatMeasure, sideLabel } from "@/modules/clinical/constants";
import { GoalList, MeasurementForm, NewEpisodeForm, NoteEditor, PlanForm, SeriesTable, SignedNote } from "./parts";

type Panel = NonNullable<Awaited<ReturnType<typeof getTreatmentPanel>>>;
const day = (d: string) => formatDate(`${d}T12:00:00+05:30`);

/**
 * Feature #4: the return-visit view. Previous signed note beside today's note,
 * goals, plan and next reassessment, without leaving the appointment.
 */
export function TreatmentSection({ p, patientId, myName }: { p: Panel; patientId: string; myName: string }) {
  const apptId = p.appointment.id;
  const ep = p.episode;
  const ctx = { patientId, appointmentId: apptId, episodeId: ep?.id ?? null };
  const editable = p.canWrite && (!p.today || p.today.status === "DRAFT") && ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"].includes(p.appointment.status);
  return (
    <section className="card xl:col-span-2" aria-labelledby="tx-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="tx-h" className="text-lg font-bold">Treatment{p.visitNumber ? ` · visit ${p.visitNumber} of this episode` : ""}</h2>
        <Link href={`/admin/chart/${patientId}`} className="btn btn-secondary btn-sm">Full clinical record</Link>
      </div>
      {!p.isAssigned ? <p className="text-sm text-[var(--color-ink-muted)]">You are on this patient&apos;s care team but not assigned to this visit, so you can read but not write its note.</p> : null}

      {/* Episode filing */}
      {ep ? (
        <p className="mt-2"><span className="font-semibold">Episode:</span> <Link href={`/admin/chart/${patientId}/episodes/${ep.id}`}>{ep.title}</Link>
          {ep.body_region ? ` · ${ep.side ? sideLabel(ep.side) + " " : ""}${ep.body_region.toLowerCase()}` : ""}{ep.working_diagnosis ? ` · ${ep.working_diagnosis}` : ""}
          {p.plan?.next_reassessment_on ? <> · <strong>reassess {day(p.plan.next_reassessment_on)}</strong></> : null}</p>
      ) : p.canFile ? (
        <div className="mt-3"><Notice tone="warn" title="File this visit under an episode of care">
          {p.episodes.length ? (
            <ActionForm action={linkEpisodeAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="patientId" value={patientId} /><input type="hidden" name="appointmentId" value={apptId} />
              <div><label className="field-label" htmlFor="lk-ep">Existing episode</label>
                <select id="lk-ep" name="episodeId" className="input">{p.episodes.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></div>
              <SubmitButton small>File visit</SubmitButton>
            </ActionForm>
          ) : null}
          <details className="mt-3" open={!p.episodes.length}><summary className="cursor-pointer font-semibold">{p.episodes.length ? "Or start a new episode" : "Start an episode"}</summary>
            <div className="mt-2"><NewEpisodeForm ctx={{ patientId, appointmentId: apptId }} hasLegacy={!!p.legacy} idPrefix="txe" /></div></details>
        </Notice></div>
      ) : <p className="mt-2 text-sm">Not filed under an episode yet.</p>}

      {p.legacy && !ep ? (
        <div className="mt-3"><Notice title="Earlier record (before episodes)">
          {p.legacy.diagnosis ? <p><span className="font-semibold">Diagnosis:</span> {p.legacy.diagnosis}</p> : null}
          {p.legacy.treatment_protocol ? <p><span className="font-semibold">Protocol:</span> {p.legacy.treatment_protocol}</p> : null}
        </Notice></div>
      ) : null}

      {/* Previous note beside today's */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="font-semibold">Previous signed note</h3>
          {p.previous ? <SignedNote n={p.previous} ctx={ctx} canAddend={false} /> : <p className="text-sm text-[var(--color-ink-muted)]">None — this is the first documented visit{ep ? " in this episode" : ""}.</p>}
        </div>
        <div>
          <h3 className="font-semibold">Today&apos;s note</h3>
          {!ep ? <p className="text-sm text-[var(--color-ink-muted)]">File the visit under an episode to start the note.</p>
            : editable ? <NoteEditor ctx={{ ...ctx, appointmentId: apptId }} draft={p.today} canSign={["CHECKED_IN", "IN_PROGRESS", "COMPLETED"].includes(p.appointment.status)} />
            : p.today ? <SignedNote n={p.today} ctx={ctx} canAddend={p.canFile} />
            : <p className="text-sm text-[var(--color-ink-muted)]">No note yet{p.isAssigned ? " — a note can be written once the visit is confirmed." : "."}</p>}
        </div>
      </div>

      {ep ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="font-semibold">Goals</h3>
            {!p.goals.some((g) => g.status === "ACTIVE") && p.goals.length ? <p className="text-sm">All goals closed: {p.goals.map((g) => `${g.description} (${goalStatusLabel(g.status)})`).join("; ")}</p> : null}
            <div className="mt-2"><GoalList goals={p.goals.filter((g) => g.status === "ACTIVE")} ctx={{ ...ctx, episodeId: ep.id }} canWrite={p.canWrite && ep.status === "OPEN"} /></div>
          </div>
          <div>
            <h3 className="font-semibold">Plan</h3>
            {p.plan ? <p className="text-sm">{[p.plan.frequency, p.plan.interventions].filter(Boolean).join(" · ") || "—"} <span className="text-[var(--color-ink-muted)]">({p.plan.author_name})</span></p> : <p className="text-sm text-[var(--color-ink-muted)]">No plan yet.</p>}
            {p.canWrite && ep.status === "OPEN" ? <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">Update plan / reassessment date</summary><div className="mt-2"><PlanForm ctx={{ ...ctx, episodeId: ep.id }} current={p.plan} /></div></details> : null}
            <h3 className="mt-4 font-semibold">Progress</h3>
            {p.series.length ? (
              <ul className="mt-1 space-y-1 text-sm">{p.series.map((s) => (
                <li key={s.key}>{sideLabel(s.side)} {s.body_region.toLowerCase()} {s.movement}: {s.baseline ? formatMeasure(s.baseline.value, s.unit) : "—"}{s.latest ? ` → ${formatMeasure(s.latest.value, s.unit)}` : " (no follow-up yet)"}</li>
              ))}</ul>
            ) : <p className="text-sm text-[var(--color-ink-muted)]">No measurements yet.</p>}
          </div>
          {p.canWrite && ep.status === "OPEN" ? (
            <details className="lg:col-span-2"><summary className="cursor-pointer font-semibold">Record a measurement for this visit</summary>
              <div className="mt-2"><MeasurementForm ctx={{ ...ctx, episodeId: ep.id }} region={ep.body_region} side={ep.side} /></div>
              <div className="mt-4"><SeriesTable series={p.series} ctx={{ ...ctx, episodeId: ep.id }} canWrite={p.canWrite} myName={myName} /></div>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
