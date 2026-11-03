import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader } from "@/components/ui";
import { PatientPicker } from "@/components/admin/patient-picker";
import { PaymentForm } from "@/components/admin/payment-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Record payment" };

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ q?: string; patient?: string }> }) {
  const actor = await requireStaff("PAYMENT_RECORD");
  const sp = await searchParams;
  if (!sp.patient) {
    return (<><PageHeader title="Record a payment" lead="Choose who paid. Advance payments with no invoice are kept as credit and can be applied later." />
      <PatientPicker orgId={actor.organizationId} target="/admin/payments/new" term={(sp.q ?? "").trim()} /></>);
  }
  if (!/^[0-9a-f-]{36}$/i.test(sp.patient)) notFound();
  const p = await q1<{ id: string; full_name: string }>(`SELECT id, full_name FROM patient WHERE id=$1 AND organization_id=$2`, [sp.patient, actor.organizationId]);
  if (!p) notFound();
  const open = await q<{ id: string; number: string; due_paise: string }>(
    `SELECT i.id, i.number, b.amount_due_paise::text due_paise FROM invoice i JOIN invoice_balance b ON b.invoice_id=i.id
      WHERE i.patient_id=$1 AND b.amount_due_paise > 0 ORDER BY i.issued_at`, [p.id]);
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/payments/new">← Choose a different patient</Link></p>
      <PageHeader title={`Payment from ${p.full_name}`} />
      <section className="card max-w-3xl">
        <PaymentForm patientId={p.id} canVerify={can(actor, "PAYMENT_VERIFY")} invoices={open} defaultInvoiceId={open[0]?.id}
          defaultAmount={open[0] ? (Number(open[0].due_paise) / 100).toFixed(2) : undefined} />
        <p className="mt-4 text-sm"><Link href={`/admin/patients/${p.id}`}>Open patient record →</Link></p>
      </section>
    </>
  );
}
