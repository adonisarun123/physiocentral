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
