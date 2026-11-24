"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createHomeProgrammeAction } from "@/app/(staff)/admin/ops-actions";

type Ex = { id: string; name: string; body_region: string | null; instructions: string; default_sets: number | null; default_reps: number | null; default_hold_seconds: number | null };
type Row = { key: number; exerciseId: string; name: string; instructions: string; sets: string; reps: string; hold: string; perDay: string; perWeek: string; note: string };

const empty = (key: number): Row => ({ key, exerciseId: "", name: "", instructions: "", sets: "", reps: "", hold: "", perDay: "", perWeek: "", note: "" });

export function HomeProgrammeForm({ patientId, exercises, episodes }: {
  patientId: string; exercises: Ex[]; episodes: { id: string; title: string }[];
}) {
  const [rows, setRows] = useState<Row[]>([empty(1), empty(2), empty(3)]);
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const pick = (key: number, id: string) => {
    const ex = exercises.find((e) => e.id === id);
    set(key, ex
      ? { exerciseId: id, name: ex.name, instructions: ex.instructions, sets: ex.default_sets?.toString() ?? "", reps: ex.default_reps?.toString() ?? "", hold: ex.default_hold_seconds?.toString() ?? "" }
      : { exerciseId: "" });
  };
  const regions = [...new Set(exercises.map((e) => e.body_region ?? "Other"))];

  return (
    <ActionForm action={createHomeProgrammeAction} className="grid gap-4">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="rowCount" value={rows.length} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="field-label" htmlFor="hp-t">Sheet title</label>
          <input id="hp-t" name="title" required minLength={2} maxLength={120} className="input" defaultValue="Home exercise programme" /></div>
        <div><label className="field-label" htmlFor="hp-e">Episode of care (optional)</label>
          <select id="hp-e" name="episodeId" className="input" defaultValue={episodes.length === 1 ? episodes[0].id : ""}>
            <option value="">Not linked</option>
            {episodes.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select></div>
      </div>

      <ol className="grid gap-4">
        {rows.map((r, i) => (
          <li key={r.key} className="rounded-lg border border-[var(--color-line)] p-3">
            <fieldset className="grid gap-3">
              <legend className="font-semibold">Exercise {i + 1}</legend>
              <input type="hidden" name={`r${i}exercise`} value={r.exerciseId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="field-label" htmlFor={`hp-${r.key}-x`}>From the library</label>
                  <select id={`hp-${r.key}-x`} className="input" value={r.exerciseId} onChange={(e) => pick(r.key, e.target.value)}>
                    <option value="">— Type your own —</option>
                    {regions.map((g) => (
                      <optgroup key={g} label={g}>
                        {exercises.filter((e) => (e.body_region ?? "Other") === g).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </optgroup>
                    ))}
                  </select></div>
                <div><label className="field-label" htmlFor={`hp-${r.key}-n`}>Name</label>
                  <input id={`hp-${r.key}-n`} name={`r${i}name`} maxLength={120} className="input" value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} /></div>
              </div>
              <div><label className="field-label" htmlFor={`hp-${r.key}-i`}>Instructions for the patient</label>
                <textarea id={`hp-${r.key}-i`} name={`r${i}instructions`} maxLength={1500} rows={3} className="input" value={r.instructions} onChange={(e) => set(r.key, { instructions: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {([["sets", "Sets", 20], ["reps", "Reps", 200], ["hold", "Hold (sec)", 600], ["perDay", "Times a day", 12], ["perWeek", "Days a week", 7]] as const).map(([k, label, max]) => (
                  <div key={k}><label className="field-label" htmlFor={`hp-${r.key}-${k}`}>{label}</label>
                    <input id={`hp-${r.key}-${k}`} name={`r${i}${k}`} type="number" min={1} max={max} className="input" value={r[k]} onChange={(e) => set(r.key, { [k]: e.target.value })} /></div>
                ))}
              </div>
              <div><label className="field-label" htmlFor={`hp-${r.key}-note`}>Note for this exercise (optional)</label>
                <input id={`hp-${r.key}-note`} name={`r${i}note`} maxLength={300} className="input" value={r.note} onChange={(e) => set(r.key, { note: e.target.value })} /></div>
              {rows.length > 1 ? <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>Remove exercise {i + 1}</button></div> : null}
            </fieldset>
          </li>
        ))}
      </ol>
      {rows.length < 30 ? <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows((rs) => [...rs, empty(Math.max(...rs.map((x) => x.key)) + 1)])}>+ Add another exercise</button></div> : null}

      <div><label className="field-label" htmlFor="hp-a">General advice (optional)</label>
        <textarea id="hp-a" name="advice" maxLength={1500} rows={3} className="input" /></div>
      <p className="field-hint">Empty rows are ignored. Once issued, a sheet can&apos;t be edited; issue a new one and stop the old one.</p>
      <div><SubmitButton>Issue sheet</SubmitButton></div>
    </ActionForm>
  );
}
