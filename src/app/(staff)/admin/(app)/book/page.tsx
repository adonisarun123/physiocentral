import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { q, q1, getPool } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { PageHeader, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PatientPicker } from "@/components/admin/patient-picker";
import { findSlots } from "@/modules/scheduling/availability";
import { primaryBranch } from "@/modules/clinic/team";
import { displayPhone, formatDate, formatTime, todayInZone } from "@/lib/format";
import { staffBookAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New booking" };

type SP = { q?: string; patient?: string; service?: string; therapist?: string; date?: string };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function StaffBookPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireStaff("APPOINTMENT_ACCEPT");
  const sp = await searchParams;
  if (!sp.patient) {
    return (<><PageHeader title="New booking" lead="Phone or walk-in. Confirmed straight away, checked against the same double-booking rules as online requests." />
      <PatientPicker orgId={actor.organizationId} target="/admin/book" term={(sp.q ?? "").trim()} /></>);
  }
  if (!UUID.test(sp.patient)) notFound();
  const patient = await q1<{ id: string; full_name: string; public_ref: string; phone: string | null }>(
    `SELECT p.id, p.full_name, p.public_ref, (SELECT value FROM patient_contact c WHERE c.patient_id=p.id AND c.kind='PHONE' LIMIT 1) phone
       FROM patient p WHERE p.id=$1 AND p.organization_id=$2`, [sp.patient, actor.organizationId]);
  if (!patient) notFound();
  const branch = await primaryBranch(getPool(), actor.organizationId);
  const [services, therapists] = await Promise.all([
    q<{ id: string; name: string; duration_minutes: number }>(`SELECT id, name, duration_minutes FROM service WHERE organization_id=$1 AND status='ACTIVE' AND bookable ORDER BY sort_order, name`, [actor.organizationId]),
    q<{ id: string; display_name: string }>(`SELECT id, display_name FROM therapist WHERE organization_id=$1 AND active ORDER BY display_name`, [actor.organizationId]),
  ]);
  const serviceId = sp.service && UUID.test(sp.service) ? sp.service : services[0]?.id;
  const therapistId = sp.therapist && UUID.test(sp.therapist) ? sp.therapist : "";
  const chosenDate = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
  let date = chosenDate ?? todayInZone(branch.timezone);
  let slots = serviceId ? await findSlots({ branchId: branch.id, serviceId, therapistId: therapistId || null, date, enforceLeadTime: false }) : [];
  let jumped = false;
  // No date picked and nothing left today → show the next day that has free times (up to 2 weeks ahead).
  for (let i = 1; !chosenDate && serviceId && !slots.length && i <= 14; i++) {
    const d = new Date(`${todayInZone(branch.timezone)}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const next = d.toISOString().slice(0, 10);
    const found = await findSlots({ branchId: branch.id, serviceId, therapistId: therapistId || null, date: next, enforceLeadTime: false });
    if (found.length) { date = next; slots = found; jumped = true; }
  }
  const names = new Map(therapists.map((t) => [t.id, t.display_name]));
  // One option per start time; show who is free at that time.
  const byTime = new Map<number, string[]>();
  for (const s of slots) {
    const k = new Date(s.starts_at).getTime();
    byTime.set(k, [...(byTime.get(k) ?? []), names.get(s.therapist_id) ?? "—"]);
  }

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/book">← Choose a different patient</Link></p>
      <PageHeader title="New booking" lead={<>For <Link href={`/admin/patients/${patient.id}`} className="font-semibold">{patient.full_name}</Link> · {patient.phone ? displayPhone(patient.phone) : "no phone"}</>} />
      <section className="card">
        <form className="flex flex-wrap items-end gap-3" action="/admin/book">
          <input type="hidden" name="patient" value={patient.id} />
          <div><label className="field-label" htmlFor="b-s">Service</label>
            <select id="b-s" name="service" defaultValue={serviceId} className="input">{services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes} min)</option>)}</select></div>
          <div><label className="field-label" htmlFor="b-t">Physiotherapist</label>
            <select id="b-t" name="therapist" defaultValue={therapistId} className="input"><option value="">Any available</option>{therapists.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}</select></div>
          <div><label className="field-label" htmlFor="b-d">Date</label><input id="b-d" name="date" type="date" defaultValue={date} min={todayInZone(branch.timezone)} className="input" /></div>
          <button className="btn btn-secondary">Show free times</button>
        </form>
      </section>

      <section className="card mt-6">
        <h2 className="text-lg font-bold">Free times · {formatDate(`${date}T06:00:00Z`)}</h2>
        {jumped ? <p className="text-sm text-[var(--color-ink-muted)]">Nothing left today, so this shows the next day with free times.</p> : null}
        {!byTime.size ? <div className="mt-2"><Notice tone="warn">No free times on this date for this service{therapistId ? " and physiotherapist" : ""}. Try another date or &quot;Any available&quot;. (Holidays, leave and existing bookings are excluded.)</Notice></div> : (
          <ActionForm action={staffBookAction} className="mt-3">
            <input type="hidden" name="patientId" value={patient.id} /><input type="hidden" name="serviceId" value={serviceId} /><input type="hidden" name="therapistId" value={therapistId} />
            <fieldset><legend className="sr-only">Choose a time</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {[...byTime.entries()].map(([t, who], i) => (
                  <label key={t} className="flex cursor-pointer flex-col rounded-lg border border-[var(--color-line)] p-2 has-[:checked]:border-[var(--color-brand)] has-[:checked]:bg-[var(--color-brand-soft)]">
                    <span className="flex items-center gap-2 font-semibold"><input type="radio" name="startsAt" value={new Date(t).toISOString()} required defaultChecked={i === 0} />{formatTime(new Date(t), branch.timezone)}</span>
                    <span className="text-xs text-[var(--color-ink-muted)]">{therapistId ? "" : who.join(", ")}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <fieldset className="flex gap-4"><legend className="field-label">Booked by</legend>
                <label className="flex items-center gap-2"><input type="radio" name="source" value="PHONE" defaultChecked /> Phone</label>
                <label className="flex items-center gap-2"><input type="radio" name="source" value="WALK_IN" /> Walk-in</label>
              </fieldset>
              <div className="min-w-64 flex-1"><label className="field-label" htmlFor="b-r">Reason / note (optional)</label><input id="b-r" name="reason" maxLength={500} className="input" /></div>
            </div>
            <p className="field-hint mt-2">{therapistId ? "" : "With \"Any available\", the first free physiotherapist at that time is assigned."}</p>
            <div className="mt-3"><SubmitButton>Confirm booking</SubmitButton></div>
          </ActionForm>
        )}
      </section>
    </>
  );
}
