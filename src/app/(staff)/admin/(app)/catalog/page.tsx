import type { Metadata } from "next";
import { q } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, StatusBadge, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatINR } from "@/modules/billing/money";
import { formatDate } from "@/lib/format";
import { addPriceAction, createServiceAction, serviceStatusAction, updateServiceAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Service catalog" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireStaff();
  if (!can(actor, "CATALOG_MANAGE") && !can(actor, "PRICE_MANAGE")) {
    const { redirect } = await import("next/navigation");
    redirect("/admin/forbidden");
  }
  const term = ((await searchParams).q ?? "").trim();
  const categories = await q<{ id: string; name: string }>(`SELECT id, name FROM service_category WHERE organization_id=$1 ORDER BY sort_order, name`, [actor.organizationId]);
  const services = await q<{ id: string; code: string; name: string; category: string | null; category_id: string | null; status: string; public: boolean; bookable: boolean; duration_minutes: number; billing_unit: string; clinical_reviewer: string | null; reviewed_on: string | null; current_price: string | null; summary: string | null; headline: string | null; body: string | null; who_it_may_help: string | null; conditions: string[] }>(
    `SELECT s.id, s.code, s.name, c.name category, s.category_id, s.summary, s.headline, s.body, s.who_it_may_help, s.conditions, s.status, s.public, s.bookable, s.duration_minutes, s.billing_unit, s.clinical_reviewer,
            to_char(s.reviewed_on,'YYYY-MM-DD') reviewed_on,
            (SELECT unit_price_paise::text FROM service_price_version p WHERE p.service_id=s.id AND p.branch_id IS NULL AND p.valid_during @> now() LIMIT 1) current_price
       FROM service s LEFT JOIN service_category c ON c.id=s.category_id
      WHERE s.organization_id=$1 AND ($2 = '' OR s.name ILIKE '%'||$2||'%' OR s.code ILIKE '%'||$2||'%' OR c.name ILIKE '%'||$2||'%')
      ORDER BY (s.status = 'ARCHIVED'), c.sort_order NULLS LAST, s.sort_order, s.name`,
    [actor.organizationId, term],
  );
  const history = await q<{ service_id: string; unit_price_paise: string; from: Date; to: Date | null }>(
    `SELECT pv.service_id, pv.unit_price_paise, lower(pv.valid_during) "from", upper(pv.valid_during) "to"
       FROM service_price_version pv JOIN service s ON s.id=pv.service_id WHERE s.organization_id=$1 ORDER BY lower(pv.valid_during) DESC`,
    [actor.organizationId],
  );

  return (
    <>
      <PageHeader title="Service catalog" lead="New services start as private drafts. Set a price, then publish under Status and visibility (needs a named clinical reviewer).">
        {can(actor, "CATALOG_MANAGE") ? <a href="#add-service" className="btn btn-primary">+ Add a service</a> : null}
      </PageHeader>
      <Notice tone="info">Tax treatment is &quot;not yet classified&quot; until your accountant approves categories (§9.3). Taxed lines cannot be issued until then.</Notice>
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
              {can(actor, "CATALOG_MANAGE") ? (
                <ActionForm action={updateServiceAction} className="mt-3 border-b border-[var(--color-line)] pb-5">
                  <input type="hidden" name="serviceId" value={s.id} />
                  <h3 className="font-semibold">Details</h3>
                  <ServiceFields idp={s.id} categories={categories} v={s} />
                  <div className="mt-3"><SubmitButton small>Save details</SubmitButton></div>
                </ActionForm>
              ) : null}
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
      {can(actor, "CATALOG_MANAGE") ? (
        <section id="add-service" className="card mt-8 scroll-mt-6" aria-labelledby="add-h">
          <h2 id="add-h" className="text-xl font-bold">Add a service</h2>
          <ActionForm action={createServiceAction} className="mt-3">
            <ServiceFields idp="new" categories={categories} />
            <div className="mt-3 flex flex-wrap items-end gap-4">
              {can(actor, "PRICE_MANAGE") ? <div><label className="field-label" htmlFor="new-price">Price per session (₹, optional)</label><input id="new-price" name="priceRupees" inputMode="decimal" className="input w-40" /></div> : null}
              <label className="flex items-center gap-2 pb-2"><input type="checkbox" name="allTherapists" defaultChecked className="h-5 w-5" /> All physiotherapists can provide it</label>
            </div>
            <div className="mt-4"><SubmitButton>Add service</SubmitButton></div>
          </ActionForm>
        </section>
      ) : null}
    </>
  );
}

function ServiceFields({ idp, categories, v }: {
  idp: string; categories: { id: string; name: string }[];
  v?: { name: string; category_id: string | null; duration_minutes: number; billing_unit: string; summary: string | null; headline: string | null; body: string | null; who_it_may_help: string | null; conditions: string[] };
}) {
  return (
    <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2"><label className="field-label" htmlFor={`${idp}-n`}>Name</label><input id={`${idp}-n`} name="name" required defaultValue={v?.name} className="input" /></div>
      <div><label className="field-label" htmlFor={`${idp}-c`}>Category</label>
        <select id={`${idp}-c`} name="categoryId" defaultValue={v?.category_id ?? ""} className="input"><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className="flex gap-2">
        <div><label className="field-label" htmlFor={`${idp}-d`}>Minutes</label><input id={`${idp}-d`} name="durationMinutes" type="number" min={5} max={480} step={5} required defaultValue={v?.duration_minutes ?? 45} className="input w-24" /></div>
        <div><label className="field-label" htmlFor={`${idp}-u`}>Billed per</label><input id={`${idp}-u`} name="billingUnit" defaultValue={v?.billing_unit ?? "Session"} className="input w-28" /></div>
      </div>
      <div className="sm:col-span-2"><label className="field-label" htmlFor={`${idp}-s`}>Short summary (cards &amp; search results)</label><textarea id={`${idp}-s`} name="summary" rows={2} defaultValue={v?.summary ?? ""} className="input" /></div>
      <div className="sm:col-span-2"><label className="field-label" htmlFor={`${idp}-h`}>Page headline</label><textarea id={`${idp}-h`} name="headline" rows={2} defaultValue={v?.headline ?? ""} className="input" /></div>
      <div className="sm:col-span-2"><label className="field-label" htmlFor={`${idp}-b`}>About this service</label><textarea id={`${idp}-b`} name="body" rows={4} defaultValue={v?.body ?? ""} className="input" /></div>
      <div><label className="field-label" htmlFor={`${idp}-w`}>Who it may help</label><textarea id={`${idp}-w`} name="whoItMayHelp" rows={4} defaultValue={v?.who_it_may_help ?? ""} className="input" /></div>
      <div><label className="field-label" htmlFor={`${idp}-k`}>Conditions treated (one per line)</label><textarea id={`${idp}-k`} name="conditions" rows={4} defaultValue={(v?.conditions ?? []).join("\n")} className="input" /></div>
    </div>
  );
}
