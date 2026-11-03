import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { PageHeader, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { HoursGrid } from "@/components/admin/hours-grid";
import { TimeOff } from "@/components/admin/time-off";
import { therapistActiveAction, therapistHoursAction, therapistServicesAction, updateTherapistAction } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Physiotherapist" };

export default async function TherapistPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const actor = await requireStaff("SETTINGS_MANAGE");
  const { id } = await params;
  const created = (await searchParams).created === "1";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await q1<{ id: string; resource_id: string; display_name: string; designation: string; bio: string | null; languages: string[]; active: boolean; public: boolean; credentials_verified: boolean }>(
    `SELECT id, resource_id, display_name, designation, bio, languages, active, public, credentials_verified FROM therapist WHERE id=$1 AND organization_id=$2`,
    [id, actor.organizationId]);
  if (!t) notFound();
  const [services, skills, shifts, leave] = await Promise.all([
    q<{ id: string; name: string; status: string }>(`SELECT id, name, status FROM service WHERE organization_id=$1 AND status <> 'ARCHIVED' ORDER BY sort_order, name`, [actor.organizationId]),
    q<{ service_id: string }>(`SELECT service_id FROM therapist_skill WHERE therapist_id=$1`, [t.id]),
    q<{ weekday: number; start: string; end: string }>(`SELECT weekday, to_char(start_local,'HH24:MI') "start", to_char(end_local,'HH24:MI') "end" FROM availability_rule WHERE resource_id=$1 ORDER BY weekday, start_local`, [t.resource_id]),
    q<{ id: string; lo: Date; hi: Date; reason: string; who: string | null }>(`SELECT id, lower(blocked) lo, upper(blocked) hi, reason, NULL who FROM availability_exception WHERE resource_id=$1 AND upper(blocked) > now() ORDER BY lower(blocked)`, [t.resource_id]),
  ]);
  const has = new Set(skills.map((s) => s.service_id));

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/team">← Physiotherapists</Link></p>
      <PageHeader title={t.display_name} lead={`${t.designation}${t.active ? "" : " · inactive"}`} />
      {created ? <div className="mb-4"><Notice tone="ok">Added. {has.size && shifts.length ? "They are now bookable online for the services ticked below." : "Add services and hours to make them bookable."}</Notice></div> : null}
      {t.active && (!has.size || !shifts.length) ? <div className="mb-4"><Notice tone="warn">Not bookable yet: needs {!has.size ? "at least one service" : ""}{!has.size && !shifts.length ? " and " : ""}{!shifts.length ? "working hours" : ""}.</Notice></div> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card" aria-labelledby="p-h">
          <h2 id="p-h" className="text-lg font-bold">Profile</h2>
          <ActionForm action={updateTherapistAction} className="mt-3">
            <input type="hidden" name="therapistId" value={t.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="field-label" htmlFor="dn">Full name</label><input id="dn" name="displayName" defaultValue={t.display_name} required className="input" /></div>
              <div><label className="field-label" htmlFor="ds">Designation</label><input id="ds" name="designation" defaultValue={t.designation} required className="input" /></div>
              <div className="sm:col-span-2"><label className="field-label" htmlFor="lg">Languages (comma-separated)</label><input id="lg" name="languages" defaultValue={t.languages.join(", ")} className="input" /></div>
              <div className="sm:col-span-2"><label className="field-label" htmlFor="bio">Bio</label><textarea id="bio" name="bio" defaultValue={t.bio ?? ""} rows={3} className="input" /></div>
            </div>
            <label className="mt-3 flex items-center gap-2"><input type="checkbox" name="credentialsVerified" defaultChecked={t.credentials_verified} className="h-5 w-5" /> I have checked their registration and qualifications</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="public" defaultChecked={t.public} className="h-5 w-5" /> Show on the public website (patients can choose them by name)</label>
            <div className="mt-3"><SubmitButton small>Save profile</SubmitButton></div>
          </ActionForm>
          <ActionForm action={therapistActiveAction} className="mt-4 border-t border-[var(--color-line)] pt-4" confirm={t.active ? "Deactivate? They will stop appearing in online slots." : undefined}>
            <input type="hidden" name="therapistId" value={t.id} /><input type="hidden" name="active" value={t.active ? "false" : "true"} />
            <SubmitButton small variant={t.active ? "danger" : "secondary"}>{t.active ? "Deactivate (left the clinic)" : "Reactivate"}</SubmitButton>
          </ActionForm>
        </section>

        <section className="card" aria-labelledby="s-h">
          <h2 id="s-h" className="text-lg font-bold">Services they provide</h2>
          <ActionForm action={therapistServicesAction} className="mt-3">
            <input type="hidden" name="therapistId" value={t.id} />
            <div className="grid gap-1">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="serviceId" value={s.id} defaultChecked={has.has(s.id)} className="h-5 w-5" /> {s.name}{s.status === "DRAFT" ? <span className="badge">Draft</span> : null}</label>
              ))}
            </div>
            <div className="mt-3"><SubmitButton small>Save services</SubmitButton></div>
          </ActionForm>
        </section>

        <section className="card xl:col-span-2" aria-labelledby="h-h">
          <h2 id="h-h" className="text-lg font-bold">Weekly working hours</h2>
          <ActionForm action={therapistHoursAction} className="mt-3 overflow-x-auto">
            <input type="hidden" name="therapistId" value={t.id} />
            <HoursGrid shifts={shifts} idPrefix="t" />
            <div className="mt-3"><SubmitButton small>Save hours</SubmitButton></div>
          </ActionForm>
        </section>

        <section className="card xl:col-span-2" aria-labelledby="l-h">
          <h2 id="l-h" className="text-lg font-bold">Leave &amp; blocked time</h2>
          <TimeOff rows={leave} therapistId={t.id} />
        </section>
      </div>
    </>
  );
}
