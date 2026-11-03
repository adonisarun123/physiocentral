import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PaymentForm } from "@/components/admin/payment-form";
import { computeBalance, formatINR } from "@/modules/billing/money";
import { displayPhone, formatDate, formatDateTime } from "@/lib/format";
import { updatePatientAction } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Patient" };

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff("PATIENT_CONTACT_VIEW");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const p = await q1<{ id: string; public_ref: string; full_name: string; created_at: Date }>(
    `SELECT id, public_ref, full_name, created_at FROM patient WHERE id=$1 AND organization_id=$2`, [id, actor.organizationId]);
  if (!p) notFound();
  const [contacts, visits, invoices, payments] = await Promise.all([
    q<{ kind: string; value: string }>(`SELECT kind, value FROM patient_contact WHERE patient_id=$1 ORDER BY preferred DESC, created_at`, [id]),
    q<{ id: string; public_ref: string; starts_at: Date; status: string; service: string; therapist: string | null; source: string }>(
      `SELECT a.id, a.public_ref, a.starts_at, a.status, s.name service, t.display_name therapist, a.source FROM appointment a
         JOIN service s ON s.id=a.service_id LEFT JOIN therapist t ON t.id=a.therapist_id WHERE a.patient_id=$1 ORDER BY a.starts_at DESC LIMIT 50`, [id]),
    q<{ id: string; number: string | null; status: string; total_paise: string; allocated: string | null; at: Date }>(
      `SELECT i.id, i.number, i.status, i.total_paise, b.net_allocated_paise::text allocated, COALESCE(i.issued_at, i.created_at) at
         FROM invoice i LEFT JOIN invoice_balance b ON b.invoice_id=i.id WHERE i.patient_id=$1 AND i.status <> 'VOIDED' ORDER BY at DESC`, [id]),
    q<{ id: string; amount_paise: string; method: string; status: string; received_on: string; unallocated: string; receipt_id: string | null; receipt_number: string | null }>(
      `SELECT pm.id, pm.amount_paise, pm.method, pm.status, to_char(pm.received_on,'YYYY-MM-DD') received_on, f.unallocated_paise::text unallocated, r.id receipt_id, r.number receipt_number
         FROM payment pm JOIN payment_funds f ON f.payment_id=pm.id LEFT JOIN receipt r ON r.payment_id=pm.id WHERE pm.patient_id=$1 ORDER BY pm.created_at DESC`, [id]),
  ]);
  const phone = contacts.find((c) => c.kind === "PHONE")?.value ?? "";
  const email = contacts.find((c) => c.kind === "EMAIL")?.value ?? "";
  const open = invoices.filter((i) => i.status === "ISSUED").map((i) => ({ ...i, bal: computeBalance(BigInt(i.total_paise), BigInt(i.allocated ?? "0")) }))
    .filter((i) => i.bal.amountDuePaise > 0n);
  const due = open.reduce((s, i) => s + i.bal.amountDuePaise, 0n);
  const credit = payments.filter((x) => x.status === "VERIFIED").reduce((s, x) => s + BigInt(x.unallocated), 0n);

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/patients">← Patients</Link></p>
      <PageHeader title={p.full_name} lead={<><span className="font-mono">{p.public_ref}</span> · {phone ? displayPhone(phone) : "no phone"} · since {formatDate(p.created_at)}</>}>
        {can(actor, "APPOINTMENT_ACCEPT") ? <Link href={`/admin/book?patient=${p.id}`} className="btn btn-primary">Book appointment</Link> : null}
        {can(actor, "INVOICE_DRAFT") ? <Link href={`/admin/invoices/new?patient=${p.id}`} className="btn btn-secondary">New invoice</Link> : null}
      </PageHeader>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-[var(--color-ink-muted)]">Amount due</p><p className="text-2xl font-bold">{formatINR(due)}</p></div>
        <div className="card"><p className="text-sm text-[var(--color-ink-muted)]">Unapplied credit</p><p className="text-2xl font-bold">{formatINR(credit)}</p></div>
        <div className="card"><p className="text-sm text-[var(--color-ink-muted)]">Visits</p><p className="text-xl font-bold">{visits.filter((v) => v.status === "COMPLETED").length} completed · {visits.filter((v) => v.status === "CONFIRMED" && new Date(v.starts_at) > new Date()).length} upcoming</p></div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card">
          <h2 className="text-lg font-bold">Appointments</h2>
          {visits.length ? (
            <ul className="mt-2 divide-y divide-[var(--color-line)]">{visits.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><Link href={`/admin/appointments/${v.id}`} className="font-semibold">{formatDateTime(v.starts_at)}</Link> · {v.service}{v.therapist ? ` · ${v.therapist}` : ""}<span className="block text-xs text-[var(--color-ink-muted)]">{v.public_ref} · {v.source.toLowerCase().replace("_", "-")}</span></span>
                <StatusBadge status={v.status} />
              </li>))}</ul>
          ) : <p className="mt-2 text-sm text-[var(--color-ink-muted)]">No appointments yet.</p>}
        </section>
        <section className="card">
          <h2 className="text-lg font-bold">Invoices &amp; payments</h2>
          <ul className="mt-2 divide-y divide-[var(--color-line)]">
            {invoices.map((i) => {
              const bal = i.status === "ISSUED" ? computeBalance(BigInt(i.total_paise), BigInt(i.allocated ?? "0")) : null;
              return <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><Link href={`/admin/invoices/${i.id}`} className="font-semibold">{i.number ?? "Draft invoice"}</Link> · {formatDate(i.at)} · {formatINR(i.total_paise)}</span>{bal ? <StatusBadge status={bal.collectionStatus} /> : <StatusBadge status={i.status} />}</li>;
            })}
            {payments.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>Payment {formatINR(x.amount_paise)} · {x.method.replace("_MANUAL", "").replace("_", " ").toLowerCase()} · {x.received_on}{x.receipt_id ? <> · <Link href={`/admin/receipts/${x.receipt_id}`}>{x.receipt_number}</Link></> : null}</span><StatusBadge status={x.status} /></li>
            ))}
            {!invoices.length && !payments.length ? <li className="py-2 text-sm text-[var(--color-ink-muted)]">Nothing billed yet.</li> : null}
          </ul>
          {can(actor, "PAYMENT_RECORD") ? (
            <details className="mt-4"><summary className="cursor-pointer font-semibold">Record a payment</summary>
              <PaymentForm patientId={p.id} canVerify={can(actor, "PAYMENT_VERIFY")} invoices={open.map((i) => ({ id: i.id, number: i.number!, due_paise: i.bal.amountDuePaise.toString() }))}
                defaultInvoiceId={open[0]?.id} defaultAmount={open[0] ? (Number(open[0].bal.amountDuePaise) / 100).toFixed(2) : undefined} />
            </details>
          ) : null}
        </section>
        <section className="card xl:col-span-2">
          <h2 className="text-lg font-bold">Contact details</h2>
          <ActionForm action={updatePatientAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="patientId" value={p.id} />
            <div><label className="field-label" htmlFor="pn">Full name</label><input id="pn" name="fullName" defaultValue={p.full_name} required className="input" /></div>
            <div><label className="field-label" htmlFor="pp">Mobile</label><input id="pp" name="phone" defaultValue={phone} required className="input" /></div>
            <div><label className="field-label" htmlFor="pe">Email</label><input id="pe" name="email" type="email" defaultValue={email} className="input" /></div>
            <SubmitButton small>Save</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
