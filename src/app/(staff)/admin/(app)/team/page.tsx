import type { Metadata } from "next";
import Link from "next/link";
import { q } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { PageHeader, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { HoursGrid, CLINIC_DEFAULT_SHIFTS } from "@/components/admin/hours-grid";
import { createTherapistAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Physiotherapists" };

export default async function TeamPage() {
  const actor = await requireStaff("SETTINGS_MANAGE");
  const team = await q<{ id: string; display_name: string; designation: string; active: boolean; public: boolean; credentials_verified: boolean; services: number; upcoming: number }>(
    `SELECT t.id, t.display_name, t.designation, t.active, t.public, t.credentials_verified,
            (SELECT count(*)::int FROM therapist_skill ts WHERE ts.therapist_id=t.id) services,
            (SELECT count(*)::int FROM appointment a WHERE a.therapist_id=t.id AND a.starts_at > now() AND a.status='CONFIRMED') upcoming
       FROM therapist t WHERE t.organization_id=$1 ORDER BY t.active DESC, t.display_name`,
    [actor.organizationId],
  );
  const services = await q<{ id: string; name: string; bookable: boolean }>(
    `SELECT id, name, bookable FROM service WHERE organization_id=$1 AND status <> 'ARCHIVED' ORDER BY sort_order, name`, [actor.organizationId]);

  return (
    <>
      <PageHeader title="Physiotherapists" lead="Who can be booked, for which services, and when. Online slots are built from these settings." />
      <ul className="grid gap-3 md:grid-cols-2">
        {team.map((t) => (
          <li key={t.id} className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold"><Link href={`/admin/team/${t.id}`}>{t.display_name}</Link></h2>
              <span className="flex flex-wrap gap-1">
                <span className="badge">{t.active ? "Active" : "Inactive"}</span>
                {t.public ? <span className="badge">On website</span> : null}
                {!t.credentials_verified ? <span className="badge text-[var(--color-warn)] bg-[var(--color-warn-soft)]">Credentials not verified</span> : null}
              </span>
            </div>
            <p className="text-sm text-[var(--color-ink-muted)]">{t.designation} · {t.services} service(s) · {t.upcoming} upcoming visit(s)</p>
            <Link href={`/admin/team/${t.id}`} className="mt-2 inline-block text-sm font-semibold">Manage profile, services, hours &amp; leave →</Link>
          </li>
        ))}
      </ul>

      <section className="card mt-8" aria-labelledby="add-h">
        <h2 id="add-h" className="text-xl font-bold">Add a physiotherapist</h2>
        <p className="text-sm text-[var(--color-ink-muted)]">They become bookable online as soon as they have at least one service and some working hours. They stay off the public website until you verify their credentials and switch &quot;show on website&quot; on.</p>
        <ActionForm action={createTherapistAction} className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="field-label" htmlFor="t-name">Full name</label><input id="t-name" name="displayName" required className="input" placeholder="e.g. Priya Raman" /></div>
            <div><label className="field-label" htmlFor="t-des">Designation</label><input id="t-des" name="designation" required className="input" defaultValue="Physiotherapist" /></div>
            <div><label className="field-label" htmlFor="t-lang">Languages (comma-separated)</label><input id="t-lang" name="languages" className="input" placeholder="English, Kannada, Hindi" /></div>
            <div><label className="field-label" htmlFor="t-bio">Short bio (optional)</label><input id="t-bio" name="bio" className="input" /></div>
          </div>
          <fieldset className="mt-5">
            <legend className="field-label">Services they can provide</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="serviceId" value={s.id} defaultChecked={s.bookable} className="h-5 w-5" /> {s.name}</label>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-5">
            <legend className="field-label">Weekly working hours</legend>
            <p className="field-hint">Pre-filled with clinic hours. Clear a day to mark it off.</p>
            <HoursGrid shifts={CLINIC_DEFAULT_SHIFTS} idPrefix="new" />
          </fieldset>
          <div className="mt-5"><SubmitButton>Add physiotherapist</SubmitButton></div>
        </ActionForm>
      </section>
      <div className="mt-6"><Notice>Want them to log in too? Create a staff login for them under <Link href="/admin/staff">Staff &amp; logins</Link> with the Physiotherapist role.</Notice></div>
    </>
  );
}
