import type { Metadata } from "next";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, EmptyState } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { listExercises, type ExerciseRow } from "@/modules/clinical/exercises";
import { exerciseActiveAction, saveExerciseAction } from "../../ops-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Exercise library", robots: { index: false, follow: false } };

function ExerciseFields({ e, idp }: { e?: ExerciseRow; idp: string }) {
  return (
    <>
      {e ? <input type="hidden" name="exerciseId" value={e.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="field-label" htmlFor={`${idp}-n`}>Name</label><input id={`${idp}-n`} name="name" required minLength={2} maxLength={120} defaultValue={e?.name} className="input" /></div>
        <div><label className="field-label" htmlFor={`${idp}-r`}>Body region (for grouping)</label><input id={`${idp}-r`} name="bodyRegion" maxLength={60} defaultValue={e?.body_region ?? ""} className="input" placeholder="e.g. Knee, Lower back, Shoulder" /></div>
      </div>
      <div><label className="field-label" htmlFor={`${idp}-i`}>Instructions for the patient</label><textarea id={`${idp}-i`} name="instructions" required minLength={2} maxLength={1500} rows={4} defaultValue={e?.instructions} className="input" /></div>
      <div className="grid grid-cols-3 gap-3 sm:max-w-md">
        <div><label className="field-label" htmlFor={`${idp}-s`}>Sets</label><input id={`${idp}-s`} name="sets" type="number" min={1} max={20} defaultValue={e?.default_sets ?? ""} className="input" /></div>
        <div><label className="field-label" htmlFor={`${idp}-p`}>Reps</label><input id={`${idp}-p`} name="reps" type="number" min={1} max={200} defaultValue={e?.default_reps ?? ""} className="input" /></div>
        <div><label className="field-label" htmlFor={`${idp}-h`}>Hold (sec)</label><input id={`${idp}-h`} name="holdSeconds" type="number" min={1} max={600} defaultValue={e?.default_hold_seconds ?? ""} className="input" /></div>
      </div>
    </>
  );
}

export default async function ExerciseLibraryPage() {
  const actor = await requireStaff("CLINICAL_NOTES_READ");
  const canWrite = can(actor, "CLINICAL_NOTES_WRITE");
  const rows = await listExercises(actor, { includeHidden: canWrite });
  return (
    <>
      <PageHeader title="Exercise library" lead="The clinic's own exercises, picked when issuing a home exercise sheet. Changes here don't alter sheets already given." />
      {canWrite ? (
        <section className="card mb-6"><h2 className="text-lg font-bold">Add an exercise</h2>
          <ActionForm action={saveExerciseAction} className="mt-3 grid gap-3"><ExerciseFields idp="new" /><div><SubmitButton>Add to library</SubmitButton></div></ActionForm>
        </section>
      ) : null}
      {rows.length === 0 ? <EmptyState>No exercises yet.</EmptyState> : (
        <ul className="grid gap-3">{rows.map((e) => (
          <li key={e.id} className={`card ${e.active ? "" : "opacity-60"}`}>
            <p className="font-semibold">{e.name}{e.body_region ? <span className="font-normal text-[var(--color-ink-muted)]"> · {e.body_region}</span> : null}{e.active ? null : " · hidden"}</p>
            <p className="whitespace-pre-line text-sm">{e.instructions}</p>
            {canWrite ? (
              <div className="mt-2 flex flex-wrap gap-4">
                <details><summary className="cursor-pointer text-sm font-semibold">Edit</summary>
                  <ActionForm action={saveExerciseAction} className="mt-3 grid gap-3"><ExerciseFields e={e} idp={`e-${e.id}`} /><div><SubmitButton small>Save</SubmitButton></div></ActionForm></details>
                <ActionForm action={exerciseActiveAction}>
                  <input type="hidden" name="exerciseId" value={e.id} /><input type="hidden" name="active" value={e.active ? "0" : "1"} />
                  <SubmitButton small variant="secondary">{e.active ? "Hide from new sheets" : "Restore"}</SubmitButton>
                </ActionForm>
              </div>
            ) : null}
          </li>))}</ul>
      )}
    </>
  );
}
