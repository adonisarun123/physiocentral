import type { Metadata } from "next";
import { q } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, StatusBadge, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatINR } from "@/modules/billing/money";
import { formatDate } from "@/lib/format";
import { addPriceAction, serviceStatusAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Service catalog" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireStaff();
  if (!can(actor, "CATALOG_MANAGE") && !can(actor, "PRICE_MANAGE")) {
    const { redirect } = await import("next/navigation");
    redirect("/admin/forbidden");
  }
  const term = ((await searchParams).q ?? "").trim();
  const services = await q<{ id: string; code: string; name: string; category: string | null; status: string; public: boolean; bookable: boolean; duration_minutes: number; billing_unit: string; clinical_reviewer: string | null; reviewed_on: string | null; current_price: string | null }>(
    `SELECT s.id, s.code, s.name, c.name category, s.status, s.public, s.bookable, s.duration_minutes, s.billing_unit, s.clinical_reviewer,
            to_char(s.reviewed_on,'YYYY-MM-DD') reviewed_on,
            (SELECT unit_price_paise::text FROM service_price_version p WHERE p.service_id=s.id AND p.branch_id IS NULL AND p.valid_during @> now() LIMIT 1) current_price
       FROM service s LEFT JOIN service_category c ON c.id=s.category_id
      WHERE s.organization_id=$1 AND ($2 = '' OR s.name ILIKE '%'||$2||'%' OR s.code ILIKE '%'||$2||'%' OR c.name ILIKE '%'||$2||'%')
      ORDER BY c.sort_order NULLS LAST, s.name`,
    [actor.organizationId, term],
  );
  const history = await q<{ service_id: string; unit_price_paise: string; from: Date; to: Date | null }>(
    `SELECT pv.service_id, pv.unit_price_paise, lower(pv.valid_during) "from", upper(pv.valid_during) "to"
       FROM service_price_version pv JOIN service s ON s.id=pv.service_id WHERE s.organization_id=$1 ORDER BY lower(pv.valid_during) DESC`,
    [actor.organizationId],
  );

  return (
    <>
      <PageHeader title="Service catalog" lead="Seeded items are drafts with no prices. Activate only what the clinic actually offers, with a named clinical reviewer." />
      <Notice tone="warn">Tax treatment is &quot;not yet classified&quot; until your accountant approves categories (§9.3). Taxed lines cannot be issued until then.</Notice>
      <form className="my-4 flex items-end gap-2" role="search">
        <div><label htmlFor="q" className="field-label">Search name, code or category</label><input id="q" name="q" defaultValue={term} className="input" /></div>
        <button className="btn btn-secondary">Search</button>
      </form>
      <ul className="space-y-3">
        {services.map((s) => (
          <li key={s.id} className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold">{s.name} <span className="font-mono text-sm font-normal">{s.code}</span></h2>
              <span className="flex gap-2"><StatusBadge status={s.status} />{s.public ? <span className="badge">Public</span> : null}{s.bookable ? <span className="badge">Bookable</span> : null}</span>
            </div>
            <p className="text-sm text-[var(--color-ink-muted)]">{s.category} · {s.duration_minutes} min · per {s.billing_unit.toLowerCase()} · current price {s.current_price ? formatINR(s.current_price) : "none"}</p>
            <details className="mt-2">
              <summary className="cursor-pointer font-semibold">Manage</summary>
              <div className="mt-3 grid gap-6 lg:grid-cols-2">
                {can(actor, "PRICE_MANAGE") ? (
                  <ActionForm action={addPriceAction}>
                    <input type="hidden" name="serviceId" value={s.id} />
                    <h3 className="font-semibold">Add price version</h3>
                    <p className="text-sm text-[var(--color-ink-muted)]">Never edits history. Accepted estimates and issued bills keep their own prices.</p>
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div><label className="field-label" htmlFor={`p-${s.id}`}>Price (₹)</label><input id={`p-${s.id}`} name="amountRupees" required inputMode="decimal" className="input w-32" /></div>
                      <div><label className="field-label" htmlFor={`f-${s.id}`}>Effective from (blank = now)</label><input id={`f-${s.id}`} name="effectiveFrom" type="datetime-local" className="input" /></div>
                      <SubmitButton small>Add price</SubmitButton>
                    </div>
                    <ul className="mt-2 text-sm">
                      {history.filter((h) => h.service_id === s.id).map((h, i) => (
                        <li key={i}>{formatINR(h.unit_price_paise)} from {formatDate(h.from)}{h.to ? ` to ${formatDate(h.to)}` : " (open)"}</li>
                      ))}
                    </ul>
                  </ActionForm>
                ) : null}
                {can(actor, "CATALOG_MANAGE") ? (
                  <ActionForm action={serviceStatusAction}>
                    <input type="hidden" name="serviceId" value={s.id} />
                    <h3 className="font-semibold">Status and visibility</h3>
                    <label className="field-label mt-2" htmlFor={`st-${s.id}`}>Status</label>
                    <select id={`st-${s.id}`} name="status" defaultValue={s.status} className="input"><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select>
                    <label className="mt-2 flex items-center gap-2"><input type="checkbox" name="public" defaultChecked={s.public} className="h-5 w-5" /> Show on public website</label>
                    <label className="flex items-center gap-2"><input type="checkbox" name="bookable" defaultChecked={s.bookable} className="h-5 w-5" /> Allow online requests</label>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div><label className="field-label" htmlFor={`rv-${s.id}`}>Clinical reviewer</label><input id={`rv-${s.id}`} name="clinicalReviewer" defaultValue={s.clinical_reviewer ?? ""} className="input" /></div>
                      <div><label className="field-label" htmlFor={`rd-${s.id}`}>Review date</label><input id={`rd-${s.id}`} name="reviewedOn" type="date" defaultValue={s.reviewed_on ?? ""} className="input" /></div>
                    </div>
                    <div className="mt-3"><SubmitButton small>Save</SubmitButton></div>
                  </ActionForm>
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
