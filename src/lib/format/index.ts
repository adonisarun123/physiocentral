/** Unambiguous local formatting (§4.2): clinic timezone, explicit zone label. */
export function formatDateTime(d: Date | string, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(d)) + (timeZone === "Asia/Kolkata" ? " IST" : ` (${timeZone})`);
}

export function formatDate(d: Date | string, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(d));
}

export function formatTime(d: Date | string, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(d));
}

export function todayInZone(timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function ageLabel(from: Date | string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function telHref(e164: string | null | undefined) {
  return e164 ? `tel:${e164}` : undefined;
}

/** Human display for Indian numbers: +917411174333 → +91 74111 74333. */
export function displayPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

/** "16:00" → "4:00 pm" */
export function time12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** All opening intervals for a weekday, e.g. "9:00 am – 1:00 pm, 4:00 pm – 8:00 pm" or null when closed. */
export function dayHours(hours: { weekday: number; opens: string; closes: string }[], weekday: number): string | null {
  const list = hours.filter((h) => h.weekday === weekday);
  return list.length ? list.map((h) => `${time12(h.opens)} – ${time12(h.closes)}`).join(", ") : null;
}
