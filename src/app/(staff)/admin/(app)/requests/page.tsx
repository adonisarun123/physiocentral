import Link from "next/link";
import type { Metadata } from "next";
import { q } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { acceptAction, rejectAction } from "../../actions";
import { ageLabel, formatDateTime } from "@/lib/format";
import { formatINR } from "@/modules/billing/money";
import { maskPhone } from "@/modules/patients/contact";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request inbox" };

export default async function RequestsPage() {
  const actor = await requireStaff("APPOINTMENT_VIEW");
  const showContact = can(actor, "PATIENT_CONTACT_VIEW");
  const rows = await q<{
    id: string; public_ref: string; version: number; created_at: Date; starts_at: Date; duration_minutes: number; source: string;
    contact_verified: boolean; accessibility_needs: string | null; quoted_price_paise: string | null; patient: string; phone: string | null;
    service: string; branch: string; timezone: string; pref: string | null;
  }>(
    `SELECT a.id, a.public_ref, a.version, a.created_at, a.starts_at, a.duration_minutes, a.source, a.contact_verified, a.accessibility_needs,
            a.quoted_price_paise, p.full_name patient,
            (SELECT value FROM patient_contact c WHERE c.patient_id=p.id AND c.kind='PHONE' ORDER BY preferred DESC LIMIT 1) phone,
            s.name service, b.name branch, b.timezone, t.display_name pref
       FROM appointment a JOIN patient p ON p.id=a.patient_id JOIN service s ON s.id=a.service_id JOIN branch b ON b.id=a.branch_id
       LEFT JOIN therapist t ON t.id=a.requested_therapist_id
      WHERE a.organization_id=$1 AND a.status='REQUESTED'
      ORDER BY a.created_at ASC LIMIT 200`,
    [actor.organizationId],
  );
  const canAccept = can(actor, "APPOINTMENT_ACCEPT");

  return (
    <>
      <PageHeader title="Request inbox" lead="Oldest first. Accepting re-checks capacity atomically; a taken slot is refused, never double booked." />
      {rows.length === 0 ? <EmptyState>No pending requests.</EmptyState> : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold"><Link href={`/admin/appointments/${r.id}`}>{r.patient}</Link> <span className="font-mono text-sm font-normal">{r.public_ref}</span></h2>
                <span className="text-sm">Waiting {ageLabel(r.created_at)} · via {r.source.toLowerCase()}</span>
              </div>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-[0.95rem] sm:grid-cols-2 lg:grid-cols-3">
                <div><dt className="inline font-semibold">Service: </dt><dd className="inline">{r.service} ({r.duration_minutes} min)</dd></div>
                <div><dt className="inline font-semibold">Requested: </dt><dd className="inline">{formatDateTime(r.starts_at, r.timezone)}</dd></div>
                <div><dt className="inline font-semibold">Branch: </dt><dd className="inline">{r.branch}</dd></div>
                <div><dt className="inline font-semibold">Therapist preference: </dt><dd className="inline">{r.pref ?? "Any available"}</dd></div>
                <div><dt className="inline font-semibold">Contact: </dt><dd className="inline">{showContact ? (r.phone ?? "—") : r.phone ? maskPhone(r.phone) : "—"} {r.contact_verified ? "(verified)" : <strong>(unverified)</strong>}</dd></div>
                <div><dt className="inline font-semibold">Quoted fee: </dt><dd className="inline">{r.quoted_price_paise ? formatINR(r.quoted_price_paise) : "Estimate after assessment"}</dd></div>
                {r.accessibility_needs ? <div className="sm:col-span-2"><dt className="inline font-semibold">Access needs: </dt><dd className="inline">{r.accessibility_needs}</dd></div> : null}
              </dl>
              {canAccept ? (
                <div className="mt-4 flex flex-wrap items-start gap-4">
                  <ActionForm action={acceptAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="version" value={r.version} />
                    <SubmitButton>Accept original terms</SubmitButton>
                  </ActionForm>
                  <details className="min-w-64 flex-1">
                    <summary className="btn btn-secondary">Reject…</summary>
                    <ActionForm action={rejectAction} className="mt-3">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="version" value={r.version} />
                      <label htmlFor={`pm-${r.id}`} className="field-label">Message to patient</label>
                      <textarea id={`pm-${r.id}`} name="patientMessage" required className="input" rows={2} defaultValue="Sorry, we can't offer this time. Please call us to find another slot." />
                      <label htmlFor={`in-${r.id}`} className="field-label mt-2">Internal note (staff only)</label>
                      <input id={`in-${r.id}`} name="internalNote" className="input" />
                      <div className="mt-2"><SubmitButton variant="danger">Reject request</SubmitButton></div>
                    </ActionForm>
                  </details>
                </div>
              ) : null}
              <p className="mt-3 text-sm text-[var(--color-ink-muted)]">To offer a different time or therapist, call the patient; patient-acceptable proposals are not built in this release.</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
