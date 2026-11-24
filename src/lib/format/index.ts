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
  // Merge overlapping/adjacent intervals so several clinicians' hours read as the clinic's hours.
  const list: { opens: string; closes: string }[] = [];
  for (const h of hours.filter((x) => x.weekday === weekday).sort((a, b) => a.opens.localeCompare(b.opens))) {
    const last = list[list.length - 1];
    if (last && h.opens <= last.closes) { if (h.closes > last.closes) last.closes = h.closes; }
    else list.push({ opens: h.opens, closes: h.closes });
  }
  return list.length ? list.map((h) => `${time12(h.opens)} – ${time12(h.closes)}`).join(", ") : null;
}

/** Group consecutive weekdays (Mon→Sun) with identical hours: [{days:"Mon – Sat", hours:"9:00 am – 1:00 pm, 4:00 pm – 8:00 pm"}, {days:"Sunday", hours:"Closed"}]. */
export function groupHours(hours: { weekday: number; opens: string; closes: string }[]) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const out: { days: string; hours: string }[] = [];
  let start = 0;
  for (let i = 1; i <= order.length; i++) {
    const prev = dayHours(hours, order[i - 1]) ?? "Closed";
    const cur = i < order.length ? dayHours(hours, order[i]) ?? "Closed" : null;
    if (cur !== prev) {
      const a = WEEKDAYS[order[start]], b = WEEKDAYS[order[i - 1]];
      out.push({ days: start === i - 1 ? a : `${a.slice(0, 3)} – ${b.slice(0, 3)}`, hours: prev });
      start = i;
    }
  }
  return out;
}

/** One-line opening summary of open days only, e.g. "Mon–Sat 8:30 am – 1:30 pm, 4:00 pm – 9:00 pm · Sun 10:00 am – 1:00 pm". */
export function hoursSummary(hours: { weekday: number; opens: string; closes: string }[]): string {
  return groupHours(hours)
    .filter((g) => g.hours !== "Closed")
    .map((g) => `${g.days.replace(" – ", "–").replace(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*day$/, "$1")} ${g.hours}`)
    .join(" · ");
}

/** "16:00" → "4 pm", "08:30" → "8:30 am" — for tight spaces. */
function timeShort(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
}

/**
 * Fixed weekly timings in compact lines for small cards, open days only:
 * ["Mon–Sat 8:30 am–1:30 pm, 4–9 pm", "Sun 10 am–1 pm"]. Same source as hoursSummary,
 * and never "open now" — the clinic asked for timings that read the same at any hour.
 */
export function hoursCardLines(hours: { weekday: number; opens: string; closes: string }[]): string[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const compact = (weekday: number): string | null => {
    const list: { opens: string; closes: string }[] = [];
    for (const h of hours.filter((x) => x.weekday === weekday).sort((a, b) => a.opens.localeCompare(b.opens))) {
      const last = list[list.length - 1];
      if (last && h.opens <= last.closes) { if (h.closes > last.closes) last.closes = h.closes; }
      else list.push({ opens: h.opens, closes: h.closes });
    }
    if (!list.length) return null;
    return list.map(({ opens, closes }) => {
      const a = timeShort(opens), b = timeShort(closes);
      const sameHalf = (Number(opens.slice(0, 2)) < 12) === (Number(closes.slice(0, 2)) < 12);
      return `${sameHalf ? a.replace(/ (am|pm)$/, "") : a}–${b}`;
    }).join(", ");
  };
  const out: string[] = [];
  let start = 0;
  for (let i = 1; i <= order.length; i++) {
    const prev = compact(order[i - 1]);
    const cur = i < order.length ? compact(order[i]) : undefined;
    if (cur !== prev) {
      if (prev) {
        const a = WEEKDAYS[order[start]].slice(0, 3), b = WEEKDAYS[order[i - 1]].slice(0, 3);
        out.push(`${start === i - 1 ? a : `${a}–${b}`} ${prev}`);
      }
      start = i;
    }
  }
  return out;
}

/** Out-patient number as staff see it: 27 → "OP-0027". Null until the patient has one. */
export function formatOpNumber(n: number | null | undefined): string | null {
  return n == null ? null : `OP-${String(n).padStart(4, "0")}`;
}

/** What to show next to a patient's name: the OP number, or the internal ref for records that do not have one yet. */
export function patientNumber(p: { op_number: number | null; public_ref: string }): string {
  return formatOpNumber(p.op_number) ?? p.public_ref;
}

/** Reads "OP-0027", "op 27" or "27" as OP number 27. Anything else is not an OP number. */
export function parseOpNumber(term: string): number | null {
  const m = /^(?:op[\s./-]*)?0*(\d{1,7})$/i.exec(term.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}
