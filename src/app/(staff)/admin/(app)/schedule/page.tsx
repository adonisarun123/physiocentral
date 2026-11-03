import type { Metadata } from "next";
import Link from "next/link";
import { q } from "@/lib/db";
import { requireStaff } from "@/modules/auth/session";
import { PageHeader } from "@/components/ui";
import { TimeOff, describeRange } from "@/components/admin/time-off";
import { WEEKDAYS, dayHours } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hours & holidays" };

export default async function SchedulePage() {
  const actor = await requireStaff("SETTINGS_MANAGE");
  const [closures, leave, rules] = await Promise.all([
    q<{ id: string; lo: Date; hi: Date; reason: string; who: string | null }>(
      `SELECT e.id, lower(e.blocked) lo, upper(e.blocked) hi, e.reason, NULL who FROM availability_exception e JOIN branch b ON b.id=e.branch_id
        WHERE b.organization_id=$1 AND e.resource_id IS NULL AND upper(e.blocked) > now() ORDER BY lower(e.blocked)`, [actor.organizationId]),
    q<{ id: string; lo: Date; hi: Date; reason: string; who: string | null; therapist_id: string }>(
      `SELECT e.id, lower(e.blocked) lo, upper(e.blocked) hi, e.reason, t.display_name who, t.id therapist_id FROM availability_exception e
         JOIN therapist t ON t.resource_id=e.resource_id WHERE t.organization_id=$1 AND upper(e.blocked) > now() ORDER BY lower(e.blocked)`, [actor.organizationId]),
    q<{ therapist_id: string; display_name: string; weekday: number; opens: string; closes: string }>(
      `SELECT t.id therapist_id, t.display_name, r.weekday, to_char(r.start_local,'HH24:MI') opens, to_char(r.end_local,'HH24:MI') closes
         FROM availability_rule r JOIN therapist t ON t.resource_id=r.resource_id WHERE t.organization_id=$1 AND t.active ORDER BY t.display_name`, [actor.organizationId]),
  ]);
  const people = [...new Map(rules.map((r) => [r.therapist_id, r.display_name])).entries()];
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <>
      <PageHeader title="Hours & holidays" lead="Clinic hours on the website are the combined working hours of active physiotherapists. Holidays block online booking for everyone." />
      <section className="card overflow-x-auto" aria-labelledby="wk-h">
        <h2 id="wk-h" className="text-lg font-bold">Weekly hours</h2>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left"><th className="py-1 pr-3">Day</th><th className="py-1 pr-3">Clinic (website)</th>{people.map(([id, name]) => <th key={id} className="py-1 pr-3"><Link href={`/admin/team/${id}`}>{name}</Link></th>)}</tr></thead>
          <tbody>
            {order.map((d) => (
              <tr key={d} className="border-t border-[var(--color-line)]">
                <th scope="row" className="py-2 pr-3 text-left font-medium">{WEEKDAYS[d]}</th>
                <td className="py-2 pr-3 font-semibold">{dayHours(rules, d) ?? "Closed"}</td>
                {people.map(([id]) => <td key={id} className="py-2 pr-3">{dayHours(rules.filter((r) => r.therapist_id === id), d) ?? "Off"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="field-hint mt-2">To change hours, open a physiotherapist and edit their weekly hours.</p>
      </section>
      <section className="card mt-6" aria-labelledby="cl-h">
        <h2 id="cl-h" className="text-lg font-bold">Clinic holidays &amp; closures</h2>
        <TimeOff rows={closures} therapistId={null} />
      </section>
      <section className="card mt-6" aria-labelledby="lv-h">
        <h2 id="lv-h" className="text-lg font-bold">Upcoming staff leave</h2>
        {leave.length ? (
          <ul className="mt-2 text-sm">{leave.map((l) => <li key={l.id} className="py-1"><span className="font-semibold">{describeRange(l.lo, l.hi)}</span> · <Link href={`/admin/team/${l.therapist_id}`}>{l.who}</Link> · {l.reason}</li>)}</ul>
        ) : <p className="mt-2 text-sm text-[var(--color-ink-muted)]">None. Add leave from a physiotherapist&apos;s page.</p>}
      </section>
    </>
  );
}
