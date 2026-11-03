import { q } from "@/lib/db";
import { findSlots } from "@/modules/scheduling/availability";

const TZ = "Asia/Kolkata";
const fmtTime = (d: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(d).toLowerCase();
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Next real bookable slot (any eligible clinician) for a service, searching ahead day by day. */
export async function nextAvailableLabel(branchId: string, serviceId: string, maxDays = 10): Promise<string | null> {
  const now = new Date();
  for (let i = 0; i < maxDays; i++) {
    const day = new Date(now.getTime() + i * 86_400_000);
    const slots = await findSlots({ branchId, serviceId, therapistId: null, date: ymd(day), enforceLeadTime: true });
    if (slots.length) {
      const s = new Date(slots[0].starts_at);
      const diff = Math.round((Date.parse(ymd(s)) - Date.parse(ymd(now))) / 86_400_000);
      const dayLabel = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(s);
      return `${dayLabel}, ${fmtTime(s)}`;
    }
  }
  return null;
}

/** "Open now · until 1:00 pm" / "Opens 4:00 pm" / "Closed today" from published hours, in clinic time. */
export async function openStatus(branchId: string): Promise<{ label: string; openNow: boolean } | null> {
  const rows = await q<{ open_now: boolean; next_change: string | null; opens_later: string | null; any_today: boolean }>(
    `WITH n AS (SELECT (now() AT TIME ZONE b.timezone) AS local FROM branch b WHERE b.id = $1),
          today AS (
            SELECT DISTINCT ar.start_local, ar.end_local FROM availability_rule ar, n
             WHERE ar.branch_id = $1 AND ar.weekday = EXTRACT(DOW FROM n.local))
     SELECT EXISTS (SELECT 1 FROM today, n WHERE n.local::time >= start_local AND n.local::time < end_local) AS open_now,
            (SELECT to_char(max(end_local), 'HH24:MI') FROM today, n WHERE n.local::time >= start_local AND n.local::time < end_local) AS next_change,
            (SELECT to_char(min(start_local), 'HH24:MI') FROM today, n WHERE start_local > n.local::time) AS opens_later,
            EXISTS (SELECT 1 FROM today) AS any_today`,
    [branchId],
  );
  const r = rows[0];
  if (!r || !r.any_today) return r ? { label: "Closed today", openNow: false } : null;
  const t = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  };
  if (r.open_now && r.next_change) return { label: `Open now · till ${t(r.next_change)}`, openNow: true };
  if (r.opens_later) return { label: `Opens ${t(r.opens_later)} today`, openNow: false };
  return { label: "Closed for today", openNow: false };
}
