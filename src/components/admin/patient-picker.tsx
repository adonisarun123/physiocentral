import Link from "next/link";
import { searchPatients } from "@/modules/patients/admin";
import { displayPhone, formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createPatientAction } from "@/app/(staff)/admin/actions";

/**
 * Step 1 of booking / invoicing / payments: find the patient, or register a
 * new one and come straight back. `target` is the page to return to, e.g. "/admin/book".
 */
export async function PatientPicker({ orgId, target, term, extra = "" }: { orgId: string; target: string; term: string; extra?: string }) {
  const hits = await searchPatients(orgId, term, term ? 25 : 10);
  const join = (p: string) => `${target}?${extra ? `${extra}&` : ""}patient=${p}`;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="card">
        <h2 className="text-lg font-bold">Find the patient</h2>
        <form className="mt-3 flex flex-wrap items-end gap-2" role="search" action={target}>
          {extra.split("&").filter(Boolean).map((kv) => { const [k, v] = kv.split("="); return <input key={k} type="hidden" name={k} value={decodeURIComponent(v ?? "")} />; })}
          <div className="min-w-56 flex-1"><label htmlFor="pq" className="field-label">Name, phone or patient ref</label><input id="pq" name="q" defaultValue={term} className="input" autoFocus /></div>
          <button className="btn btn-secondary">Search</button>
        </form>
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-muted)]">{term ? `${hits.length} match(es)` : "Recent patients"}</p>
        <ul className="mt-1 divide-y divide-[var(--color-line)]">
          {hits.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><span className="font-semibold">{h.full_name}</span> <span className="font-mono text-xs">{h.public_ref}</span>
                <span className="block text-sm text-[var(--color-ink-muted)]">{h.phone ? displayPhone(h.phone) : "no phone"} · {h.last_visit ? `last visit ${formatDate(h.last_visit)}` : `added ${formatDate(h.created_at)}`}</span></span>
              <Link href={join(h.id)} className="btn btn-secondary btn-sm">Select</Link>
            </li>
          ))}
          {!hits.length ? <li className="py-2 text-sm">No match. Register them on the right.</li> : null}
        </ul>
      </section>
      <section className="card">
        <h2 className="text-lg font-bold">New patient</h2>
        <ActionForm action={createPatientAction} className="mt-3">
          <input type="hidden" name="next" value={`${target}${extra ? `?${extra}` : ""}`} />
          <label className="field-label" htmlFor="np-n">Full name</label><input id="np-n" name="fullName" required className="input mb-3" />
          <label className="field-label" htmlFor="np-p">Mobile</label><input id="np-p" name="phone" required inputMode="tel" className="input mb-3" placeholder="98765 43210" />
          <label className="field-label" htmlFor="np-e">Email (optional)</label><input id="np-e" name="email" type="email" className="input mb-3" />
          <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" name="allowDuplicate" className="h-5 w-5" /> Create anyway if the phone already exists (e.g. family member)</label>
          <SubmitButton>Add &amp; continue</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
