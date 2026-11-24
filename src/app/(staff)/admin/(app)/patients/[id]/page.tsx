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
import { displayPhone, formatDate, formatDateTime, patientNumber } from "@/lib/format";
import { paymentDisplayStatus } from "@/modules/payments/refunds";
import { updatePatientAction } from "../../../actions";
import { PatientProfileFields } from "@/components/admin/patient-profile-fields";
import { PackageProgress } from "@/components/admin/package-progress";
import { CURRENT_AGE_SQL, sexLabel } from "@/modules/patients/admin";
import { listPackages } from "@/modules/scheduling/packages";
import { canOpenChart } from "@/modules/clinical/access";
import { IntakeForm } from "@/components/clinical/parts";
import { DocumentUpload } from "@/components/admin/document-upload";
import { documentCount } from "@/modules/patients/documents";
import { sendReminderAction } from "../../../ops-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Patient" };

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff("PATIENT_CONTACT_VIEW");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const p = await q1<{ id: string; public_ref: string; op_number: number | null; full_name: string; created_at: Date; age: number | null; sex: string | null;
    address: string | null }>(
    // Operational view only: diagnosis / protocol are clinical and shown in the chart (feature #10).
    `SELECT p.id, p.public_ref, p.op_number, p.full_name, p.created_at, ${CURRENT_AGE_SQL} age, p.sex, p.address
       FROM patient p WHERE p.id=$1 AND p.organization_id=$2`, [id, actor.organizationId]);
  if (!p) notFound();
  const [contacts, visits, invoices, payments, packages, chartAccess, intakes, docCount] = await Promise.all([
    q<{ kind: string; value: string }>(`SELECT kind, value FROM patient_contact WHERE patient_id=$1 ORDER BY preferred DESC, created_at`, [id]),
    q<{ id: string; public_ref: string; starts_at: Date; status: string; service: string; therapist: string | null; source: string; package_name: string | null }>(
      `SELECT a.id, a.public_ref, a.starts_at, a.status, s.name service, t.display_name therapist, a.source,
              (SELECT name FROM patient_package k WHERE k.id=a.package_id) package_name FROM appointment a
         JOIN service s ON s.id=a.service_id LEFT JOIN therapist t ON t.id=a.therapist_id WHERE a.patient_id=$1 ORDER BY a.starts_at DESC LIMIT 50`, [id]),
    q<{ id: string; number: string | null; status: string; total_paise: string; allocated: string | null; liability: string | null; credited: string | null; at: Date }>(
      `SELECT i.id, i.number, i.status, i.total_paise, b.net_allocated_paise::text allocated, b.net_liability_paise::text liability, b.credited_paise::text credited, COALESCE(i.issued_at, i.created_at) at
         FROM invoice i LEFT JOIN invoice_balance b ON b.invoice_id=i.id WHERE i.patient_id=$1 AND i.status <> 'VOIDED' ORDER BY at DESC`, [id]),
    q<{ id: string; amount_paise: string; method: string; status: string; received_on: string; unallocated: string; refunded: string; receipt_id: string | null; receipt_number: string | null }>(
      `SELECT pm.id, pm.amount_paise, pm.method, pm.status, to_char(pm.received_on,'YYYY-MM-DD') received_on, f.unallocated_paise::text unallocated, f.refunded_paise::text refunded, r.id receipt_id, r.number receipt_number
         FROM payment pm JOIN payment_funds f ON f.payment_id=pm.id LEFT JOIN receipt r ON r.payment_id=pm.id WHERE pm.patient_id=$1 ORDER BY pm.created_at DESC`, [id]),
    listPackages(actor.organizationId, { patientId: id }),
    canOpenChart(actor, id),
    // Reception sees that an intake arrived, never what it says.
    q<{ created_at: Date }>(`SELECT created_at FROM intake_submission WHERE patient_id=$1 ORDER BY created_at DESC`, [id]),
    // Reception sees how many documents are on file, never their names or contents.
    documentCount(actor, id),
  ]);
  const phone = contacts.find((c) => c.kind === "PHONE")?.value ?? "";
  const email = contacts.find((c) => c.kind === "EMAIL")?.value ?? "";
  const open = invoices.filter((i) => i.status === "ISSUED").map((i) => ({ ...i, bal: computeBalance(BigInt(i.liability ?? i.total_paise), BigInt(i.allocated ?? "0")) }))
    .filter((i) => i.bal.amountDuePaise > 0n);
  const due = open.reduce((s, i) => s + i.bal.amountDuePaise, 0n);
  const credit = payments.filter((x) => x.status === "VERIFIED").reduce((s, x) => s + BigInt(x.unallocated), 0n);

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/patients">← Patients</Link></p>
      <PageHeader title={p.full_name} lead={<><span className="font-mono font-semibold">{patientNumber(p)}</span>{p.age != null || p.sex ? ` · ${[p.age != null ? `${p.age} yrs` : null, sexLabel(p.sex)].filter(Boolean).join(", ")}` : ""} · {phone ? displayPhone(phone) : "no phone"} · since {formatDate(p.created_at)}</>}>
        {can(actor, "APPOINTMENT_ACCEPT") ? <Link href={`/admin/book?patient=${p.id}`} className="btn btn-primary">Book appointment</Link> : null}
        {can(actor, "APPOINTMENT_ACCEPT") ? <Link href={`/admin/book?patient=${p.id}&mode=package`} className="btn btn-secondary">Book package</Link> : null}
        {can(actor, "INVOICE_DRAFT") ? <Link href={`/admin/invoices/new?patient=${p.id}`} className="btn btn-secondary">New invoice</Link> : null}
        {chartAccess ? <Link href={`/admin/chart/${p.id}`} className="btn btn-secondary">Clinical record</Link> : null}
      </PageHeader>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-[var(--color-ink-muted)]">Amount due</p><p className="text-2xl font-bold">{formatINR(due)}</p>
          {due > 0n && can(actor, "PAYMENT_REMIND") ? (
            email ? (
              <ActionForm action={sendReminderAction} className="mt-2">
                <input type="hidden" name="patientId" value={p.id} />
                <SubmitButton small variant="secondary">Email payment reminder</SubmitButton>
              </ActionForm>
            ) : <p className="mt-1 text-xs text-[var(--color-ink-muted)]">No email on file for reminders.</p>
          ) : null}</div>
        <div className="card"><p className="text-sm text-[var(--color-ink-muted)]">Unapplied credit</p><p className="text-2xl font-bold">{formatINR(credit)}</p></div>
        <div className="card"><p className="text-sm text-[var(--color-ink-muted)]">Visits</p><p className="text-xl font-bold">{visits.filter((v) => v.status === "COMPLETED").length} completed · {visits.filter((v) => v.status === "CONFIRMED" && new Date(v.starts_at) > new Date()).length} upcoming</p></div>
      </div>
      <section className="card mb-6" aria-labelledby="intake-h">
        <h2 id="intake-h" className="text-lg font-bold">Intake</h2>
        <p className="text-sm text-[var(--color-ink-muted)]">{intakes.length ? `${intakes.length} intake form${intakes.length === 1 ? "" : "s"} on file, latest ${formatDateTime(intakes[0].created_at)}. The physiotherapist reads them in the clinical record.` : "No intake form yet."}</p>
        <details className="mt-2"><summary className="cursor-pointer font-semibold">Complete intake at reception</summary>
          <div className="mt-2"><IntakeForm ctx={{ patientId: p.id }} idPrefix="rin" /></div></details>
      </section>
      {can(actor, "DOCUMENT_UPLOAD") ? (
        <section className="card mb-6" aria-labelledby="docs-h">
          <h2 id="docs-h" className="text-lg font-bold">Scans &amp; reports</h2>
          <p className="text-sm text-[var(--color-ink-muted)]">{docCount ? `${docCount} document${docCount === 1 ? "" : "s"} on file.` : "No documents yet."} {chartAccess ? <Link href={`/admin/chart/${p.id}#doc-h`}>Open them in the clinical record</Link> : "The physiotherapist opens them in the clinical record."}</p>
          <details className="mt-2"><summary className="cursor-pointer font-semibold">Upload a scan or report the patient brought</summary>
            <div className="mt-2"><DocumentUpload patientId={p.id} idPrefix="ptdoc" /></div></details>
        </section>
      ) : null}
      {packages.length ? (
        <section className="card mb-6">
          <h2 className="text-lg font-bold">Packages</h2>
          <ul className="mt-2 divide-y divide-[var(--color-line)]">{packages.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span><Link href={`/admin/packages/${k.id}`} className="font-semibold">{k.name}</Link> <span className="font-mono text-xs">{k.public_ref}</span>
                <span className="block text-sm text-[var(--color-ink-muted)]">{k.first_at ? `${formatDate(k.first_at)} → ${formatDate(k.last_at!)}` : "no sessions booked"}{k.status === "CLOSED" ? " · closed" : ""}</span></span>
              <PackageProgress total={k.sessions_total} done={k.done} booked={k.upcoming} missed={k.no_show} validUntil={k.valid_until} expired={k.expired} />
            </li>))}</ul>
        </section>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card">
          <h2 className="text-lg font-bold">Appointments</h2>
          {visits.length ? (
            <ul className="mt-2 divide-y divide-[var(--color-line)]">{visits.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><Link href={`/admin/appointments/${v.id}`} className="font-semibold">{formatDateTime(v.starts_at)}</Link> · {v.service}{v.therapist ? ` · ${v.therapist}` : ""}<span className="block text-xs text-[var(--color-ink-muted)]">{v.public_ref} · {v.source.toLowerCase().replace("_", "-")}{v.package_name ? ` · ${v.package_name}` : ""}</span></span>
                <StatusBadge status={v.status} />
              </li>))}</ul>
          ) : <p className="mt-2 text-sm text-[var(--color-ink-muted)]">No appointments yet.</p>}
        </section>
        <section className="card">
          <h2 className="text-lg font-bold">Invoices &amp; payments</h2>
          <ul className="mt-2 divide-y divide-[var(--color-line)]">
            {invoices.map((i) => {
              const bal = i.status === "ISSUED" ? computeBalance(BigInt(i.liability ?? i.total_paise), BigInt(i.allocated ?? "0")) : null;
              return <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><Link href={`/admin/invoices/${i.id}`} className="font-semibold">{i.number ?? "Draft invoice"}</Link> · {formatDate(i.at)} · {formatINR(i.total_paise)}{i.credited && i.credited !== "0" ? ` · less credit note ${formatINR(i.credited)}` : ""}</span>{bal ? <StatusBadge status={bal.collectionStatus} /> : <StatusBadge status={i.status} />}</li>;
            })}
            {payments.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><Link href={`/admin/payments/${x.id}`} className="font-semibold">Payment {formatINR(x.amount_paise)}</Link> · {x.method.replace("_MANUAL", "").replace("_", " ").toLowerCase()} · {x.received_on}{x.receipt_id ? <> · <Link href={`/admin/receipts/${x.receipt_id}`}>{x.receipt_number}</Link></> : null}
                {x.refunded !== "0" ? <span className="block text-sm text-[var(--color-ink-muted)]">Refunded {formatINR(x.refunded)}</span> : null}</span>
                <span className="flex items-center gap-2"><StatusBadge status={paymentDisplayStatus(x.status, x.amount_paise, x.refunded)} />
                  {x.status === "VERIFIED" && BigInt(x.refunded) < BigInt(x.amount_paise) && can(actor, "PAYMENT_REFUND") ? <Link href={`/admin/payments/${x.id}`} className="btn btn-secondary btn-sm">Refund</Link> : null}</span></li>
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
          <h2 className="text-lg font-bold">Registration details</h2>
          <ActionForm action={updatePatientAction} className="mt-3 grid gap-3">
            <input type="hidden" name="patientId" value={p.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className="field-label" htmlFor="pn">Full name</label><input id="pn" name="fullName" defaultValue={p.full_name} required className="input" /></div>
              <div><label className="field-label" htmlFor="pp">Mobile</label><input id="pp" name="phone" defaultValue={phone} required className="input" /></div>
              <div><label className="field-label" htmlFor="pe">Email</label><input id="pe" name="email" type="email" defaultValue={email} className="input" /></div>
            </div>
            <PatientProfileFields idPrefix="pd" values={{ age: p.age, sex: p.sex, address: p.address }} />
            <div><SubmitButton small>Save</SubmitButton></div>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
