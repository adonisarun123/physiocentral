import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { q, q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { PageHeader, StatusBadge, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatINR } from "@/modules/billing/money";
import { formatDateTime } from "@/lib/format";
import { TRANSITIONS } from "@/modules/scheduling/appointments";
import {
  acceptAction, addEstimateLineAction, cancelAction, createEstimateAction, createInvoiceAction, markPerformedAction,
  offlineDecisionAction, removeEstimateLineAction, reviseEstimateAction, sendEstimateAction, transitionAction,
} from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Appointment" };

const TRANSITION_LABEL: Record<string, string> = { check_in: "Check in", start: "Start session", complete: "Complete visit", no_show: "Record no-show" };

export default async function AppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff("APPOINTMENT_VIEW");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const a = await q1<{
    id: string; public_ref: string; status: string; version: number; starts_at: Date; ends_at: Date; source: string; reason_brief: string | null;
    accessibility_needs: string | null; internal_note: string | null; patient_id: string; patient: string; patient_ref: string; service: string;
    branch: string; timezone: string; therapist: string | null; pref: string | null; contact_verified: boolean;
  }>(
    `SELECT a.*, p.full_name patient, p.public_ref patient_ref, s.name service, b.name branch, b.timezone,
            t.display_name therapist, rt.display_name pref
       FROM appointment a JOIN patient p ON p.id=a.patient_id JOIN service s ON s.id=a.service_id JOIN branch b ON b.id=a.branch_id
       LEFT JOIN therapist t ON t.id=a.therapist_id LEFT JOIN therapist rt ON rt.id=a.requested_therapist_id
      WHERE a.id=$1 AND a.organization_id=$2`,
    [id, actor.organizationId],
  );
  if (!a) notFound(); // non-disclosing for other orgs

  const [events, estimates, charges, invoices, catalog, phone] = await Promise.all([
    q<{ from_status: string | null; to_status: string; actor: string; reason: string | null; created_at: Date }>(
      `SELECT from_status, to_status, actor, reason, created_at FROM appointment_status_event WHERE appointment_id=$1 ORDER BY created_at`, [id]),
    q<{ id: string; estimate_id: string; version_no: number; status: string; total_paise: string; content_hash: string | null; valid_until: Date | null }>(
      `SELECT v.id, v.estimate_id, v.version_no, v.status, v.total_paise, v.content_hash, v.valid_until
         FROM estimate_version v JOIN estimate e ON e.id=v.estimate_id WHERE e.appointment_id=$1 ORDER BY v.estimate_id, v.version_no DESC`, [id]),
    q<{ id: string; description: string; quantity: string; unit_price_paise: string; estimate_line_id: string | null; invoice_number: string | null; invoice_id: string | null; invoice_status: string | null }>(
      `SELECT c.id, c.description, trim_scale(c.quantity)::text quantity, c.unit_price_paise, c.estimate_line_id, i.number invoice_number, i.id invoice_id, i.status invoice_status
         FROM billable_charge c LEFT JOIN invoice_line il ON il.billable_charge_id=c.id LEFT JOIN invoice i ON i.id=il.invoice_id
        WHERE c.appointment_id=$1 ORDER BY c.created_at`, [id]),
    q<{ id: string; number: string | null; status: string; total_paise: string }>(`SELECT id, number, status, total_paise FROM invoice WHERE appointment_id=$1 ORDER BY created_at`, [id]),
    q<{ id: string; name: string; unit_price_paise: string }>(
      `SELECT s.id, s.name, pv.unit_price_paise FROM service s JOIN service_price_version pv ON pv.service_id=s.id AND pv.branch_id IS NULL AND pv.valid_during @> now()
        WHERE s.organization_id=$1 AND s.status='ACTIVE' ORDER BY s.name`, [actor.organizationId]),
    can(actor, "PATIENT_CONTACT_VIEW")
      ? q1<{ value: string }>(`SELECT value FROM patient_contact WHERE patient_id=$1 AND kind='PHONE' ORDER BY preferred DESC LIMIT 1`, [a.patient_id])
      : Promise.resolve(undefined),
  ]);
  const lines = estimates.length
    ? await q<{ id: string; estimate_version_id: string; description: string; quantity: string; total_paise: string; is_extra: boolean; reason: string | null; charge_id: string | null }>(
        `SELECT l.id, l.estimate_version_id, l.description, trim_scale(l.quantity)::text quantity, l.total_paise, l.is_extra, l.reason, c.id charge_id
           FROM estimate_line l LEFT JOIN billable_charge c ON c.estimate_line_id=l.id
          WHERE l.estimate_version_id = ANY($1::uuid[]) ORDER BY l.sort_order, l.id`, [estimates.map((e) => e.id)])
    : [];
  const unbilled = charges.filter((c) => !c.invoice_id);
  const transitions = Object.entries(TRANSITIONS).filter(([, t]) => t.from.includes(a.status as never));
  const hidden = (
    <>
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="version" value={a.version} />
    </>
  );

  return (
    <>
      <PageHeader title={a.patient} lead={<><span className="font-mono">{a.public_ref}</span> · {a.service} · {formatDateTime(a.starts_at, a.timezone)}</>}>
        <StatusBadge status={a.status} />
      </PageHeader>
      <p className="mb-4 text-sm text-[var(--color-ink-muted)]">Version {a.version}. If someone else changes this appointment, your next action is refused and you&apos;ll be asked to reload.</p>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card" aria-labelledby="details-h">
          <h2 id="details-h" className="text-lg font-bold">Details</h2>
          <dl className="mt-2 space-y-1">
            <div><dt className="inline font-semibold">Branch: </dt><dd className="inline">{a.branch}</dd></div>
            <div><dt className="inline font-semibold">Therapist: </dt><dd className="inline">{a.therapist ?? `Not assigned (preference: ${a.pref ?? "any"})`}</dd></div>
            <div><dt className="inline font-semibold">Patient ref: </dt><dd className="inline font-mono">{a.patient_ref}</dd></div>
            <div><dt className="inline font-semibold">Phone: </dt><dd className="inline">{phone?.value ?? "Hidden for your role"} {a.contact_verified ? "" : "(unverified)"}</dd></div>
            <div><dt className="inline font-semibold">Source: </dt><dd className="inline">{a.source.toLowerCase()}</dd></div>
            {a.reason_brief ? <div><dt className="inline font-semibold">Reason (patient-entered): </dt><dd className="inline">{a.reason_brief}</dd></div> : null}
            {a.accessibility_needs ? <div><dt className="inline font-semibold">Access needs: </dt><dd className="inline">{a.accessibility_needs}</dd></div> : null}
            {a.internal_note ? <div><dt className="inline font-semibold">Internal note: </dt><dd className="inline">{a.internal_note}</dd></div> : null}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {a.status === "REQUESTED" && can(actor, "APPOINTMENT_ACCEPT") ? (
              <ActionForm action={acceptAction}>{hidden}<SubmitButton small>Accept original terms</SubmitButton></ActionForm>
            ) : null}
            {can(actor, "APPOINTMENT_TRANSITION") && transitions.map(([name]) => (
              <ActionForm key={name} action={transitionAction}>{hidden}<input type="hidden" name="transition" value={name} /><SubmitButton small variant={name === "no_show" ? "danger" : "primary"}>{TRANSITION_LABEL[name]}</SubmitButton></ActionForm>
            ))}
          </div>
          {["REQUESTED", "CONFIRMED", "CHECKED_IN"].includes(a.status) && can(actor, "APPOINTMENT_CANCEL") ? (
            <details className="mt-4">
              <summary className="btn btn-danger btn-sm">Cancel…</summary>
              <ActionForm action={cancelAction} className="mt-2" confirm="Cancel this appointment and release the slot?">
                {hidden}
                <label htmlFor="reason" className="field-label">Reason (recorded with policy snapshot)</label>
                <input id="reason" name="reason" required className="input" />
                <div className="mt-2"><SubmitButton small variant="danger">Confirm cancellation</SubmitButton></div>
              </ActionForm>
            </details>
          ) : null}
        </section>

        <section className="card" aria-labelledby="tl-h">
          <h2 id="tl-h" className="text-lg font-bold">Timeline</h2>
          <ol className="mt-2 space-y-2 text-sm">
            {events.map((e, i) => (
              <li key={i} className="border-l-2 border-[var(--color-line)] pl-3">
                <span className="font-semibold">{e.from_status ? `${e.from_status} → ` : ""}{e.to_status}</span> · {formatDateTime(e.created_at, a.timezone)}
                <span className="block text-[var(--color-ink-muted)]">{e.actor.split(":")[0]}{e.reason ? ` — ${e.reason}` : ""}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="card xl:col-span-2" aria-labelledby="est-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="est-h" className="text-lg font-bold">Estimates and additional charges</h2>
            {can(actor, "ESTIMATE_MANAGE") ? (
              <ActionForm action={createEstimateAction}><input type="hidden" name="appointmentId" value={a.id} /><SubmitButton small variant="secondary">New estimate</SubmitButton></ActionForm>
            ) : null}
          </div>
          {estimates.length === 0 ? <p className="mt-2 text-[var(--color-ink-muted)]">No estimates. Use one to get patient approval before adding extra services or materials.</p> : null}
          {estimates.map((v) => {
            const vl = lines.filter((l) => l.estimate_version_id === v.id);
            return (
              <div key={v.id} className="mt-4 rounded-lg border border-[var(--color-line)] p-4">
                <p className="font-semibold">Version {v.version_no} <StatusBadge status={v.status} /> · Total {formatINR(v.total_paise)}</p>
                <div className="table-region" role="region" aria-label={`Estimate version ${v.version_no} lines`} tabIndex={0}>
                  <table className="data mt-2">
                    <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Amount</th><th>Billing</th></tr></thead>
                    <tbody>
                      {vl.map((l) => (
                        <tr key={l.id}>
                          <td>{l.description}{l.is_extra ? <span className="block text-sm text-[var(--color-ink-muted)]">Extra — {l.reason}</span> : null}</td>
                          <td className="num">{l.quantity}</td>
                          <td className="num">{formatINR(l.total_paise)}</td>
                          <td>
                            {v.status === "DRAFT" && can(actor, "ESTIMATE_MANAGE") ? (
                              <ActionForm action={removeEstimateLineAction}><input type="hidden" name="lineId" value={l.id} /><input type="hidden" name="appointmentId" value={a.id} /><SubmitButton small variant="secondary">Remove</SubmitButton></ActionForm>
                            ) : v.status === "ACCEPTED" ? (
                              l.charge_id ? <span className="text-sm">Performed ✓</span> : can(actor, "APPOINTMENT_TRANSITION") ? (
                                <ActionForm action={markPerformedAction}><input type="hidden" name="lineId" value={l.id} /><input type="hidden" name="appointmentId" value={a.id} /><SubmitButton small>Mark performed</SubmitButton></ActionForm>
                              ) : null
                            ) : <span className="text-sm text-[var(--color-ink-muted)]">Not billable</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {v.status === "DRAFT" && can(actor, "ESTIMATE_MANAGE") ? (
                  <div className="mt-3 flex flex-wrap items-end gap-4">
                    <ActionForm action={addEstimateLineAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="versionId" value={v.id} /><input type="hidden" name="appointmentId" value={a.id} />
                      <div><label className="field-label" htmlFor={`svc-${v.id}`}>Catalog item</label>
                        <select id={`svc-${v.id}`} name="serviceId" className="input" required>
                          {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} — {formatINR(c.unit_price_paise)}</option>)}
                        </select></div>
                      <div><label className="field-label" htmlFor={`qty-${v.id}`}>Qty</label><input id={`qty-${v.id}`} name="quantity" defaultValue="1" className="input w-20" inputMode="decimal" /></div>
                      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="isExtra" className="h-5 w-5" defaultChecked /> Additional charge</label>
                      <div><label className="field-label" htmlFor={`rsn-${v.id}`}>Reason (patient-visible)</label><input id={`rsn-${v.id}`} name="reason" className="input" /></div>
                      <SubmitButton small>Add line</SubmitButton>
                    </ActionForm>
                    <ActionForm action={sendEstimateAction}><input type="hidden" name="versionId" value={v.id} /><input type="hidden" name="appointmentId" value={a.id} /><SubmitButton small variant="secondary">Freeze &amp; send to patient</SubmitButton></ActionForm>
                  </div>
                ) : null}
                {v.status === "SENT" && can(actor, "ESTIMATE_RECORD_OFFLINE_APPROVAL") ? (
                  <details className="mt-3">
                    <summary className="btn btn-secondary btn-sm">Record patient&apos;s decision given in person / by phone…</summary>
                    <ActionForm action={offlineDecisionAction} className="mt-2 max-w-xl">
                      <input type="hidden" name="versionId" value={v.id} /><input type="hidden" name="appointmentId" value={a.id} /><input type="hidden" name="contentHash" value={v.content_hash ?? ""} />
                      <p className="text-sm">The patient must have seen the total of <strong>{formatINR(v.total_paise)}</strong> including all additional items.</p>
                      <label className="field-label mt-2" htmlFor={`dec-${v.id}`}>Decision</label>
                      <select id={`dec-${v.id}`} name="decision" className="input"><option value="ACCEPTED">Accepted</option><option value="DECLINED">Declined</option></select>
                      <label className="field-label mt-2" htmlFor={`m-${v.id}`}>Method</label>
                      <select id={`m-${v.id}`} name="method" className="input"><option value="STAFF_RECORDED_IN_PERSON">In person</option><option value="STAFF_RECORDED_PHONE">Phone</option></select>
                      <label className="field-label mt-2" htmlFor={`att-${v.id}`}>Attestation — how and when the patient confirmed</label>
                      <textarea id={`att-${v.id}`} name="attestation" required minLength={10} className="input" rows={2} />
                      <div className="mt-2"><SubmitButton small>Record decision</SubmitButton></div>
                    </ActionForm>
                  </details>
                ) : null}
                {["SENT", "ACCEPTED", "DECLINED"].includes(v.status) && can(actor, "ESTIMATE_MANAGE") ? (
                  <ActionForm action={reviseEstimateAction} className="mt-3"><input type="hidden" name="versionId" value={v.id} /><input type="hidden" name="appointmentId" value={a.id} /><SubmitButton small variant="secondary">Change → new version (needs new approval)</SubmitButton></ActionForm>
                ) : null}
              </div>
            );
          })}
        </section>

        <section className="card xl:col-span-2" aria-labelledby="bill-h">
          <h2 id="bill-h" className="text-lg font-bold">Billable charges and invoices</h2>
          {charges.length === 0 ? (
            <p className="mt-2 text-[var(--color-ink-muted)]">No billable charges yet. Completing the visit creates the session charge (if the service has an active price); accepted estimate lines become billable when marked performed.</p>
          ) : (
            <ActionForm action={createInvoiceAction} className="mt-2">
              <input type="hidden" name="patientId" value={a.patient_id} /><input type="hidden" name="appointmentId" value={a.id} />
              <fieldset>
                <legend className="sr-only">Charges</legend>
                <ul className="space-y-1">
                  {charges.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      {c.invoice_id ? <span className="w-5" aria-hidden="true">✓</span> : <input type="checkbox" name="chargeId" value={c.id} defaultChecked id={`ch-${c.id}`} className="h-5 w-5" />}
                      <label htmlFor={`ch-${c.id}`}>{c.description} × {c.quantity} @ {formatINR(c.unit_price_paise)}</label>
                      {c.invoice_id ? <Link href={`/admin/invoices/${c.invoice_id}`} className="text-sm">on {c.invoice_number ?? "draft"} </Link> : null}
                    </li>
                  ))}
                </ul>
              </fieldset>
              {unbilled.length && can(actor, "INVOICE_DRAFT") ? <div className="mt-3"><SubmitButton small>Create draft invoice from selected</SubmitButton></div> : null}
            </ActionForm>
          )}
          {invoices.length ? (
            <ul className="mt-4 space-y-1">{invoices.map((i) => (
              <li key={i.id}><Link href={`/admin/invoices/${i.id}`}>{i.number ?? "Draft invoice"}</Link> <StatusBadge status={i.status} /> {formatINR(i.total_paise)}</li>
            ))}</ul>
          ) : null}
          <div className="mt-4"><Notice>Clinical notes and intake are not part of this release; record clinical information in your existing clinical system.</Notice></div>
        </section>
      </div>
    </>
  );
}
