import { randomUUID } from "node:crypto";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  addendumAction, addGoalAction, addMeasurementAction, createEpisodeAction, goalProgressAction, recordIntakeAction, revisePlanAction, saveNoteAction, voidMeasurementAction,
} from "@/app/(staff)/admin/clinical-actions";
import { BODY_REGIONS, GOAL_STATUSES, MEASUREMENT_KINDS, SIDES, UNITS, UNIT_KEYS, formatMeasure, goalStatusLabel, kindLabel, sideLabel } from "@/modules/clinical/constants";
import type { GoalView, NoteView } from "@/modules/clinical/read";
import type { Series } from "@/modules/clinical/series";

/* Building blocks for the chart, episode page and the appointment's Treatment section. */

type Ctx = { patientId: string; episodeId?: string | null; appointmentId?: string | null };
const Hidden = ({ patientId, episodeId, appointmentId }: Ctx) => (
  <>
    <input type="hidden" name="patientId" value={patientId} />
    {episodeId ? <input type="hidden" name="episodeId" value={episodeId} /> : null}
    {appointmentId ? <input type="hidden" name="appointmentId" value={appointmentId} /> : null}
  </>
);
const day = (d: string) => formatDate(`${d}T12:00:00+05:30`);

export function RegionSideFields({ idPrefix, region, side, required }: { idPrefix: string; region?: string | null; side?: string | null; required?: boolean }) {
  return (
    <>
      <div><label className="field-label" htmlFor={`${idPrefix}-region`}>Body region</label>
        <select id={`${idPrefix}-region`} name="bodyRegion" defaultValue={region ?? ""} required={required} className="input">
          <option value="">{required ? "Choose…" : "—"}</option>
          {BODY_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select></div>
      <div><label className="field-label" htmlFor={`${idPrefix}-side`}>Side</label>
        <select id={`${idPrefix}-side`} name="side" defaultValue={side ?? ""} required={required} className="input">
          <option value="">{required ? "Choose…" : "—"}</option>
          {SIDES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select></div>
    </>
  );
}

export function NewEpisodeForm({ ctx, hasLegacy, idPrefix = "ne" }: { ctx: Ctx; hasLegacy: boolean; idPrefix?: string }) {
  return (
    <ActionForm action={createEpisodeAction} className="grid gap-3">
      <Hidden {...ctx} episodeId={null} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1"><label className="field-label" htmlFor={`${idPrefix}-t`}>Episode name</label>
          <input id={`${idPrefix}-t`} name="title" required minLength={2} maxLength={120} className="input" placeholder="e.g. Left knee — post-ACL rehab" /></div>
        <RegionSideFields idPrefix={idPrefix} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="field-label" htmlFor={`${idPrefix}-dx`}>Working diagnosis</label>
          <textarea id={`${idPrefix}-dx`} name="workingDiagnosis" rows={2} maxLength={2000} className="input" /></div>
        <div><label className="field-label" htmlFor={`${idPrefix}-ref`}>Referred by</label>
          <input id={`${idPrefix}-ref`} name="referrer" maxLength={200} className="input" placeholder="e.g. Dr Nitin Sunku, self" /></div>
      </div>
      {hasLegacy ? (
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="attachLegacy" className="h-5 w-5" />
          I have reviewed the earlier diagnosis / protocol text and it belongs to this episode</label>
      ) : null}
      <div><SubmitButton small>Start episode</SubmitButton></div>
    </ActionForm>
  );
}

export function IntakeForm({ ctx, episodes, idPrefix = "in" }: { ctx: Ctx; episodes?: { id: string; title: string }[]; idPrefix?: string }) {
  return (
    <ActionForm action={recordIntakeAction} className="grid gap-3">
      <Hidden {...ctx} episodeId={null} />
      {/* One key per rendered form: a double submit stores one intake. */}
      <input type="hidden" name="submissionKey" value={randomUUID()} />
      <div><label className="field-label" htmlFor={`${idPrefix}-mc`}>Main concern</label>
        <textarea id={`${idPrefix}-mc`} name="mainConcern" required minLength={2} maxLength={1000} rows={2} className="input" placeholder="In the patient's words" /></div>
      <div><label className="field-label" htmlFor={`${idPrefix}-h`}>Relevant history (injuries, surgery, conditions, medication)</label>
        <textarea id={`${idPrefix}-h`} name="relevantHistory" maxLength={3000} rows={3} className="input" /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="field-label" htmlFor={`${idPrefix}-g`}>What they want to get back to</label>
          <input id={`${idPrefix}-g`} name="patientGoal" maxLength={500} className="input" placeholder="e.g. climb stairs at home" /></div>
        <div><label className="field-label" htmlFor={`${idPrefix}-r`}>Referred by</label><input id={`${idPrefix}-r`} name="referrer" maxLength={200} className="input" /></div>
        <div><label className="field-label" htmlFor={`${idPrefix}-l`}>Preferred language</label><input id={`${idPrefix}-l`} name="preferredLanguage" maxLength={40} className="input" placeholder="e.g. Kannada" /></div>
      </div>
      {episodes?.length ? (
        <div><label className="field-label" htmlFor={`${idPrefix}-ep`}>For episode (optional)</label>
          <select id={`${idPrefix}-ep`} name="episodeId" className="input"><option value="">— Not yet decided —</option>{episodes.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></div>
      ) : null}
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="treatmentConsent" className="h-5 w-5" />
        The patient consents to assessment and treatment</label>
      <div><SubmitButton small>Save intake</SubmitButton></div>
    </ActionForm>
  );
}

export function NoteBody({ n }: { n: Pick<NoteView, "subjective" | "objective" | "assessment" | "plan" | "interventions" | "patient_response"> }) {
  const rows: [string, string | null][] = [
    ["S — Subjective", n.subjective], ["O — Objective", n.objective], ["A — Assessment", n.assessment], ["P — Plan", n.plan],
    ["Interventions", n.interventions], ["Patient response", n.patient_response],
  ];
  return (
    <dl className="mt-2 space-y-2">
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k}><dt className="text-sm font-semibold text-[var(--color-ink-muted)]">{k}</dt><dd className="whitespace-pre-line">{v}</dd></div>
      ))}
    </dl>
  );
}

export function SignedNote({ n, ctx, canAddend, heading }: { n: NoteView; ctx: Ctx; canAddend: boolean; heading?: string }) {
  return (
    <article className="rounded-lg border border-[var(--color-line)] p-4">
      <header>
        <h3 className="font-semibold">{heading ?? `${formatDate(n.visit_at, n.timezone)} · ${n.service}`}</h3>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {n.status === "SIGNED" ? <>Signed by {n.author_name} · {formatDateTime(n.signed_at!, n.timezone)}</> : <>Draft by {n.author_name} · last saved {formatDateTime(n.updated_at, n.timezone)}</>}
        </p>
      </header>
      <NoteBody n={n} />
      {n.addenda.length ? (
        <section className="mt-3 border-t border-[var(--color-line)] pt-2" aria-label="Addenda">
          {n.addenda.map((x) => (
            <div key={x.id} className="mt-2"><p className="text-sm font-semibold">Addendum · {x.author_name} · {formatDateTime(x.created_at, n.timezone)}</p><p className="whitespace-pre-line">{x.body}</p></div>
          ))}
        </section>
      ) : null}
      {canAddend && n.status === "SIGNED" ? (
        <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Add an addendum</summary>
          <ActionForm action={addendumAction} className="mt-2">
            <Hidden {...ctx} /><input type="hidden" name="noteId" value={n.id} />
            <label className="field-label" htmlFor={`ad-${n.id}`}>Addendum (dated and attributed to you; the signed note is not changed)</label>
            <textarea id={`ad-${n.id}`} name="body" required minLength={3} maxLength={4000} rows={3} className="input" />
            <div className="mt-2"><SubmitButton small variant="secondary">Add addendum</SubmitButton></div>
          </ActionForm>
        </details>
      ) : null}
    </article>
  );
}

export function NoteEditor({ ctx, draft, canSign }: { ctx: Ctx & { appointmentId: string }; draft: NoteView | null; canSign: boolean }) {
  const f = (name: string, label: string, value: string | null | undefined, rows = 3, max = 4000) => (
    <div><label className="field-label" htmlFor={`nt-${name}`}>{label}</label>
      <textarea id={`nt-${name}`} name={name} rows={rows} maxLength={max} defaultValue={value ?? ""} className="input" /></div>
  );
  return (
    <ActionForm action={saveNoteAction} className="grid gap-3">
      <Hidden {...ctx} />
      <input type="hidden" name="noteVersion" value={draft?.version ?? ""} />
      {f("subjective", "S — Subjective (what the patient reports)", draft?.subjective)}
      {f("objective", "O — Objective (what you observed and measured)", draft?.objective)}
      {f("assessment", "A — Assessment (your clinical reasoning, progress)", draft?.assessment)}
      {f("plan", "P — Plan (next steps, home programme, next visit)", draft?.plan)}
      <div className="grid gap-3 sm:grid-cols-2">
        {f("interventions", "Interventions given today", draft?.interventions, 2, 2000)}
        {f("patientResponse", "Patient response", draft?.patient_response, 2, 2000)}
      </div>
      {canSign ? (
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="intent" value="sign" className="h-5 w-5" />
          Sign this note now — once signed it cannot be edited, only added to</label>
      ) : <p className="text-sm text-[var(--color-ink-muted)]">You can prepare the note now; it can be signed once the patient is checked in.</p>}
      <div><SubmitButton small>Save note</SubmitButton></div>
      {draft ? <p className="text-sm text-[var(--color-ink-muted)]">Draft saved {formatDateTime(draft.updated_at, draft.timezone)} (version {draft.version}).</p> : null}
    </ActionForm>
  );
}

export function PlanForm({ ctx, current }: { ctx: Ctx & { episodeId: string }; current: { frequency: string | null; interventions: string | null; next_reassessment_on: string | null } | null }) {
  return (
    <ActionForm action={revisePlanAction} className="grid gap-3">
      <Hidden {...ctx} />
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div><label className="field-label" htmlFor="pl-f">Frequency</label><input id="pl-f" name="frequency" maxLength={200} defaultValue={current?.frequency ?? ""} className="input" placeholder="e.g. 3 × week for 4 weeks" /></div>
        <div><label className="field-label" htmlFor="pl-n">Next reassessment</label><input id="pl-n" name="nextReassessmentOn" type="date" defaultValue={current?.next_reassessment_on ?? ""} className="input" /></div>
      </div>
      <div><label className="field-label" htmlFor="pl-i">Planned interventions</label><textarea id="pl-i" name="interventions" rows={2} maxLength={2000} defaultValue={current?.interventions ?? ""} className="input" /></div>
      <div><SubmitButton small variant="secondary">Save plan (keeps history)</SubmitButton></div>
    </ActionForm>
  );
}

export function GoalList({ goals, ctx, canWrite }: { goals: GoalView[]; ctx: Ctx & { episodeId: string }; canWrite: boolean }) {
  return (
    <div className="grid gap-3">
      {goals.length === 0 ? <p className="text-sm text-[var(--color-ink-muted)]">No functional goals yet.</p> : null}
      {goals.map((g) => {
        const last = g.progress[g.progress.length - 1];
        return (
          <article key={g.id} className="rounded-lg border border-[var(--color-line)] p-3">
            <h4 className="font-semibold">{g.description} <span className="ml-1 text-sm font-normal">({goalStatusLabel(g.status)}{g.target_on ? ` · target ${day(g.target_on)}` : ""})</span></h4>
            <p className="text-sm"><span className="font-semibold">Baseline:</span> {g.baseline}</p>
            {g.progress.length ? (
              <ol className="mt-1 space-y-1 text-sm">{g.progress.map((p) => (
                <li key={p.id}><span className="font-semibold">{day(p.recorded_on)}</span> · {p.progress}{p.status_after !== "ACTIVE" ? ` → ${goalStatusLabel(p.status_after)}` : ""} <span className="text-[var(--color-ink-muted)]">({p.author_name})</span></li>
              ))}</ol>
            ) : <p className="text-sm text-[var(--color-ink-muted)]">No progress recorded yet.</p>}
            {canWrite && g.status === "ACTIVE" ? (
              <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">Record progress{last ? "" : " (first update)"}</summary>
                <ActionForm action={goalProgressAction} className="mt-2 grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
                  <Hidden {...ctx} /><input type="hidden" name="goalId" value={g.id} />
                  <div><label className="field-label" htmlFor={`gp-${g.id}`}>Progress today</label><input id={`gp-${g.id}`} name="progress" required minLength={2} maxLength={1000} className="input" placeholder="e.g. one flight with rail, 1 rest" /></div>
                  <div><label className="field-label" htmlFor={`gs-${g.id}`}>Status</label>
                    <select id={`gs-${g.id}`} name="status" className="input">{GOAL_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                  <SubmitButton small>Record</SubmitButton>
                </ActionForm>
              </details>
            ) : null}
          </article>
        );
      })}
      {canWrite ? (
        <details><summary className="cursor-pointer text-sm font-semibold">Add a functional goal</summary>
          <ActionForm action={addGoalAction} className="mt-2 grid gap-2">
            <Hidden {...ctx} />
            <div><label className="field-label" htmlFor="ng-d">Goal</label><input id="ng-d" name="description" required minLength={3} maxLength={300} className="input" placeholder="e.g. Climb one flight of stairs independently" /></div>
            <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
              <div><label className="field-label" htmlFor="ng-b">Baseline today</label><input id="ng-b" name="baseline" required maxLength={500} className="input" placeholder="e.g. Needs rail and one-step-at-a-time, 3 rests" /></div>
              <div><label className="field-label" htmlFor="ng-t">Target date</label><input id="ng-t" name="targetOn" type="date" className="input" /></div>
            </div>
            <div><SubmitButton small variant="secondary">Add goal</SubmitButton></div>
          </ActionForm>
        </details>
      ) : null}
    </div>
  );
}

/** Tiny progress line for one series; the table beside it is the accessible version. */
function Sparkline({ s }: { s: Series }) {
  if (s.points.length < 2) return null;
  const vals = s.points.map((p) => Number(p.value));
  const min = Math.min(...vals), max = Math.max(...vals);
  const w = 120, h = 32, pad = 3;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (vals.length - 1);
  const y = (v: number) => (max === min ? h / 2 : h - pad - ((v - min) * (h - 2 * pad)) / (max - min));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="text-[var(--color-primary,#0b6b5d)]">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={vals.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
      {vals.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="currentColor" />)}
    </svg>
  );
}

export function SeriesTable({ series, ctx, canWrite, myName }: { series: Series[]; ctx: Ctx & { episodeId: string }; canWrite: boolean; myName?: string }) {
  if (!series.length) return <p className="text-sm text-[var(--color-ink-muted)]">No measurements yet.</p>;
  return (
    <div className="grid gap-3">
      {series.map((s) => (
        <article key={s.key} className="rounded-lg border border-[var(--color-line)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">{sideLabel(s.side)} {s.body_region.toLowerCase()} · {s.movement} <span className="text-sm font-normal text-[var(--color-ink-muted)]">({kindLabel(s.kind)}, {UNITS[s.unit as keyof typeof UNITS]?.label ?? s.unit})</span></h4>
            <Sparkline s={s} />
          </div>
          <p className="text-sm">
            {s.baseline ? <>Baseline <strong>{formatMeasure(s.baseline.value, s.unit)}</strong> on {day(s.baseline.measured_on)}</> : "No valid measurement"}
            {s.latest ? <> → latest <strong>{formatMeasure(s.latest.value, s.unit)}</strong> on {day(s.latest.measured_on)} ({s.change! > 0 ? "+" : ""}{formatMeasure(s.change!, s.unit)})</> : s.baseline ? " · no follow-up measurement yet" : ""}
          </p>
          <div className="table-region" role="region" tabIndex={0} aria-label={`${s.movement} measurements`}>
            <table className="data mt-2 text-sm">
              <thead><tr><th>Date</th><th className="num">Value</th><th>Recorded by</th><th>Note</th></tr></thead>
              <tbody>
                {[...s.points, ...s.voided].sort((a, b) => a.measured_on.localeCompare(b.measured_on)).map((m) => (
                  <tr key={m.id} className={m.voided_at ? "line-through opacity-60" : ""}>
                    <td>{day(m.measured_on)}</td><td className="num">{formatMeasure(m.value, m.unit)}</td><td>{m.author_name}</td>
                    <td>{m.voided_at ? <span className="no-underline">Entered in error — {m.void_reason} ({m.voided_by})</span> : m.observation ?? ""}
                      {canWrite && !m.voided_at && m.author_name === myName ? (
                        <details className="no-underline"><summary className="cursor-pointer">Entered in error?</summary>
                          <ActionForm action={voidMeasurementAction} className="mt-1 flex flex-wrap items-end gap-2">
                            <Hidden {...ctx} /><input type="hidden" name="measurementId" value={m.id} />
                            <label className="sr-only" htmlFor={`vr-${m.id}`}>Reason</label>
                            <input id={`vr-${m.id}`} name="reason" required minLength={3} maxLength={300} placeholder="Reason" className="input" />
                            <SubmitButton small variant="danger">Strike out</SubmitButton>
                          </ActionForm>
                        </details>
                      ) : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </div>
  );
}

export function MeasurementForm({ ctx, region, side }: { ctx: Ctx & { episodeId: string }; region?: string | null; side?: string | null }) {
  return (
    <ActionForm action={addMeasurementAction} className="grid gap-3">
      <Hidden {...ctx} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="field-label" htmlFor="ms-k">Measuring</label>
          <select id="ms-k" name="kind" required className="input">{MEASUREMENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></div>
        <RegionSideFields idPrefix="ms" region={region} side={side} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_1fr]">
        <div><label className="field-label" htmlFor="ms-m">Movement or test</label><input id="ms-m" name="movement" required minLength={2} maxLength={80} className="input" placeholder="e.g. flexion, quadriceps, pain on stairs" /></div>
        <div><label className="field-label" htmlFor="ms-v">Value</label><input id="ms-v" name="value" required inputMode="decimal" className="input" /></div>
        <div><label className="field-label" htmlFor="ms-u">Unit / scale</label>
          <select id="ms-u" name="unit" required className="input">{UNIT_KEYS.map((u) => <option key={u} value={u}>{UNITS[u].label}</option>)}</select></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div><label className="field-label" htmlFor="ms-o">Observation (optional)</label><input id="ms-o" name="observation" maxLength={500} className="input" placeholder="e.g. end-range pain, compensatory hip hitch" /></div>
        <div><label className="field-label" htmlFor="ms-d">Date (defaults to the visit date)</label><input id="ms-d" name="measuredOn" type="date" className="input" /></div>
      </div>
      <div><SubmitButton small variant="secondary">Record measurement</SubmitButton></div>
    </ActionForm>
  );
}
