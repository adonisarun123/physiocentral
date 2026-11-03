import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { PageHeader, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PatientPicker } from "@/components/admin/patient-picker";
import { formatINR } from "@/modules/billing/money";
import { directInvoiceAction } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New invoice" };
const ROWS = 6;

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ q?: string; patient?: string }> }) {
  const actor = await requireStaff("INVOICE_DRAFT");
  const sp = await searchParams;
  if (!sp.patient) {
    return (<><PageHeader title="New invoice" lead="For walk-ins, packages, braces and other items. Visit charges from completed appointments can also be billed from the appointment page." />
      <PatientPicker orgId={actor.organizationId} target="/admin/invoices/new" term={(sp.q ?? "").trim()} /></>);
  }
  if (!/^[0-9a-f-]{36}$/i.test(sp.patient)) notFound();
  const p = await q1<{ id: string; full_name: string; public_ref: string }>(`SELECT id, full_name, public_ref FROM patient WHERE id=$1 AND organization_id=$2`, [sp.patient, actor.organizationId]);
  if (!p) notFound();
  const [services, unbilled] = await Promise.all([
    q<{ id: string; name: string; price: string | null }>(
      `SELECT s.id, s.name, (SELECT unit_price_paise::text FROM service_price_version v WHERE v.service_id=s.id AND v.branch_id IS NULL AND v.valid_during @> now() LIMIT 1) price
         FROM service s WHERE s.organization_id=$1 AND s.status='ACTIVE' ORDER BY s.sort_order, s.name`, [actor.organizationId]),
    q<{ n: number }>(`SELECT count(*)::int n FROM billable_charge c WHERE c.patient_id=$1 AND NOT EXISTS (SELECT 1 FROM invoice_line l WHERE l.billable_charge_id=c.id)`, [p.id]),
  ]);

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/invoices/new">← Choose a different patient</Link></p>
      <PageHeader title="New invoice" lead={<>For <Link href={`/admin/patients/${p.id}`} className="font-semibold">{p.full_name}</Link> <span className="font-mono text-sm">{p.public_ref}</span></>} />
      {unbilled[0]?.n ? <div className="mb-4"><Notice tone="warn">This patient has {unbilled[0].n} unbilled visit charge(s). Bill those from the appointment page so they are not charged twice.</Notice></div> : null}
      <section className="card">
        <ActionForm action={directInvoiceAction}>
          <input type="hidden" name="patientId" value={p.id} /><input type="hidden" name="lineCount" value={ROWS} />
          <div className="table-region" role="region" aria-label="Invoice lines" tabIndex={0}>
            <table className="data">
              <thead><tr><th>Service (or leave blank)</th><th>Description</th><th>Qty</th><th>Price each (₹)</th><th>Discount (₹)</th></tr></thead>
              <tbody>
                {Array.from({ length: ROWS }, (_, i) => (
                  <tr key={i}>
                    <td><select aria-label={`Line ${i + 1} service`} name={`l${i}service`} className="input min-w-52"><option value="">— custom item —</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.price ? ` · ${formatINR(s.price)}` : ""}</option>)}</select></td>
                    <td><input aria-label={`Line ${i + 1} description`} name={`l${i}desc`} className="input min-w-52" placeholder={i === 0 ? "e.g. 10-session package, knee brace" : ""} /></td>
                    <td><input aria-label={`Line ${i + 1} quantity`} name={`l${i}qty`} className="input w-20" inputMode="decimal" placeholder="1" /></td>
                    <td><input aria-label={`Line ${i + 1} price`} name={`l${i}price`} className="input w-32" inputMode="decimal" placeholder={i === 0 ? "catalog price" : ""} /></td>
                    <td><input aria-label={`Line ${i + 1} discount`} name={`l${i}disc`} className="input w-28" inputMode="decimal" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-hint mt-2">Pick a service to use its catalog price, or type a description and price for anything else. Blank rows are ignored. The discount is the rupee amount off the whole line.</p>
          <div className="mt-3"><SubmitButton>Create draft invoice</SubmitButton></div>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">You&apos;ll review the draft, then issue it to get an invoice number.</p>
        </ActionForm>
      </section>
    </>
  );
}
