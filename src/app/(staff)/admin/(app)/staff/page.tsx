import type { Metadata } from "next";
import { q } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { PageHeader, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ROLES } from "@/modules/auth/permissions";
import { ROLE_LABELS } from "@/modules/staff/admin";
import { createStaffAction, resetStaffPasswordAction, staffActiveAction, updateStaffAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff & logins" };

function RolePicker({ selected, idp, canOwner }: { selected: string[]; idp: string; canOwner: boolean }) {
  return (
    <fieldset className="grid gap-1 sm:grid-cols-2"><legend className="field-label">Roles</legend>
      {ROLES.map((r) => (
        <label key={r} className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="role" value={r} defaultChecked={selected.includes(r)} disabled={r === "OWNER" && !canOwner} className="mt-0.5 h-5 w-5" id={`${idp}-${r}`} />
          <span><span className="font-semibold">{ROLE_LABELS[r].label}</span><span className="block text-xs text-[var(--color-ink-muted)]">{ROLE_LABELS[r].help}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

function TherapistSelect({ v, idp, therapists }: { v: string | null; idp: string; therapists: { id: string; display_name: string }[] }) {
  return (
    <div><label className="field-label" htmlFor={`${idp}-t`}>Linked physiotherapist profile</label>
      <select id={`${idp}-t`} name="therapistId" defaultValue={v ?? ""} className="input"><option value="">None</option>{therapists.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}</select></div>
  );
}

export default async function StaffPage() {
  const actor = await requireStaff("USERS_MANAGE");
  const isOwner = actor.roles.includes("OWNER");
  const [staff, therapists] = await Promise.all([
    q<{ id: string; display_name: string; active: boolean; email: string; mfa: boolean | null; roles: string[] | null; therapist_id: string | null; last_seen: Date | null }>(
      `SELECT s.id, s.display_name, s.active, u.email, u."twoFactorEnabled" mfa,
              (SELECT array_agg(role ORDER BY role) FROM role_grant g WHERE g.staff_member_id=s.id) roles,
              (SELECT t.id FROM therapist t WHERE t.staff_member_id=s.id LIMIT 1) therapist_id,
              (SELECT max(se."updatedAt") FROM session se WHERE se."userId"=u.id) last_seen
         FROM staff_member s JOIN "user" u ON u.id=s.auth_user_id
        WHERE s.organization_id=$1 ORDER BY s.active DESC, s.display_name`, [actor.organizationId]),
    q<{ id: string; display_name: string }>(`SELECT id, display_name FROM therapist WHERE organization_id=$1 AND active ORDER BY display_name`, [actor.organizationId]),
  ]);

  return (
    <>
      <PageHeader title="Staff & logins" lead="Give each person their own login with only the access they need. Never share one login." />
      <ul className="space-y-3">
        {staff.map((m) => (
          <li key={m.id} className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">{m.display_name} <span className="text-sm font-normal text-[var(--color-ink-muted)]">{m.email}</span></h2>
              <span className="flex flex-wrap gap-1">
                {(m.roles ?? []).map((r) => <span key={r} className="badge">{ROLE_LABELS[r as keyof typeof ROLE_LABELS]?.label ?? r}</span>)}
                {!m.active ? <span className="badge text-[var(--color-danger)] bg-[var(--color-danger-soft)]">Disabled</span> : null}
                {m.mfa ? <span className="badge text-[var(--color-ok)] bg-[var(--color-ok-soft)]">2-step on</span> : <span className="badge text-[var(--color-warn)] bg-[var(--color-warn-soft)]">2-step off</span>}
              </span>
            </div>
            <p className="text-sm text-[var(--color-ink-muted)]">{m.last_seen ? `Last active ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(m.last_seen)}` : "Never signed in"}{m.id === actor.staffId ? " · this is you" : ""}</p>
            {m.id !== actor.staffId || isOwner ? (
              <details className="mt-2"><summary className="cursor-pointer font-semibold">Manage</summary>
                <ActionForm action={updateStaffAction} className="mt-3">
                  <input type="hidden" name="staffId" value={m.id} />
                  <div className="mb-3 grid gap-3 sm:grid-cols-2">
                    <div><label className="field-label" htmlFor={`${m.id}-n`}>Name</label><input id={`${m.id}-n`} name="name" defaultValue={m.display_name} className="input" /></div>
                    <TherapistSelect v={m.therapist_id} idp={m.id} therapists={therapists} />
                  </div>
                  <RolePicker selected={m.roles ?? []} idp={m.id} canOwner={isOwner} />
                  {/* Disabled checkboxes don't submit: keep an existing OWNER grant when a non-owner edits. */}
                  {!isOwner && (m.roles ?? []).includes("OWNER") ? <input type="hidden" name="role" value="OWNER" /> : null}
                  <div className="mt-3"><SubmitButton small>Save</SubmitButton></div>
                </ActionForm>
                {m.id !== actor.staffId ? (
                  <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--color-line)] pt-4">
                    <ActionForm action={resetStaffPasswordAction} confirm={`Reset ${m.display_name}'s password? They will be signed out.`}>
                      <input type="hidden" name="staffId" value={m.id} /><SubmitButton small variant="secondary">Reset password</SubmitButton>
                    </ActionForm>
                    <ActionForm action={staffActiveAction} confirm={m.active ? `Disable ${m.display_name}'s login? They are signed out immediately.` : undefined}>
                      <input type="hidden" name="staffId" value={m.id} /><input type="hidden" name="active" value={m.active ? "false" : "true"} />
                      <SubmitButton small variant={m.active ? "danger" : "secondary"}>{m.active ? "Disable login" : "Re-enable login"}</SubmitButton>
                    </ActionForm>
                  </div>
                ) : null}
              </details>
            ) : null}
          </li>
        ))}
      </ul>

      <section className="card mt-8" aria-labelledby="ns-h">
        <h2 id="ns-h" className="text-xl font-bold">Add a staff login</h2>
        <div className="my-3"><Notice>You&apos;ll see a one-time password after saving. Hand it over in person; they change it and set up two-step verification on first sign-in.</Notice></div>
        <ActionForm action={createStaffAction}>
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <div><label className="field-label" htmlFor="ns-n">Name</label><input id="ns-n" name="name" required className="input" /></div>
            <div><label className="field-label" htmlFor="ns-e">Work email (their username)</label><input id="ns-e" name="email" type="email" required className="input" /></div>
            <TherapistSelect v={null} idp="ns" therapists={therapists} />
          </div>
          <RolePicker selected={["RECEPTIONIST"]} idp="ns" canOwner={isOwner} />
          <div className="mt-4"><SubmitButton>Create login</SubmitButton></div>
        </ActionForm>
      </section>
    </>
  );
}
