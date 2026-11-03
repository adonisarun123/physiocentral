import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { formatINR } from "@/modules/billing/money";
import { formatDate } from "@/lib/format";
import { PrintButton } from "../../print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Receipt" };

type Snap = { number: string; issuedAt: string; clinic: string; receivedFrom: string; patientRef: string; method: string; reference: string | null; receivedOn: string; amountPaise: string; allocationsAtIssue: { invoice_number: string; amount_paise: string }[] };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  if (!actor.permissions.has("PAYMENT_RECORD") && !actor.permissions.has("FINANCE_VIEW")) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await q1<{ snapshot: Snap }>(`SELECT snapshot FROM receipt WHERE id=$1 AND organization_id=$2`, [id, actor.organizationId]);
  if (!r) notFound();
  const s = r.snapshot;
  return (
    <article>
      <div className="mb-6 flex justify-end"><PrintButton /></div>
      <header className="border-b-2 border-[var(--color-ink)] pb-3">
        <p className="text-xl font-extrabold">{s.clinic}</p>
        <h1 className="text-2xl font-bold">Payment receipt</h1>
        <p>No. <strong>{s.number}</strong> · {formatDate(s.issuedAt)}</p>
      </header>
      <dl className="mt-4 space-y-1">
        <div><dt className="inline font-semibold">Received from: </dt><dd className="inline">{s.receivedFrom} (ref {s.patientRef})</dd></div>
        <div><dt className="inline font-semibold">Amount: </dt><dd className="inline text-lg font-bold">{formatINR(s.amountPaise)}</dd></div>
        <div><dt className="inline font-semibold">Method: </dt><dd className="inline">{s.method.replace("_", " ").toLowerCase()}{s.reference ? ` — ${s.reference}` : ""}</dd></div>
        <div><dt className="inline font-semibold">Date received: </dt><dd className="inline">{s.receivedOn}</dd></div>
      </dl>
      <h2 className="mt-6 font-bold">Applied to</h2>
      {s.allocationsAtIssue.length === 0 ? <p>Held as account credit at time of receipt.</p> : (
        <ul>{s.allocationsAtIssue.map((a, i) => <li key={i}>{a.invoice_number}: {formatINR(a.amount_paise)}</li>)}</ul>
      )}
    </article>
  );
}
