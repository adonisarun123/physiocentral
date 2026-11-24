/**
 * Report date ranges and CSV output. Pure functions (no DB, no server-only),
 * so they are unit-tested directly. Dates are clinic-local calendar days (IST).
 */
export const REPORT_VIEWS = ["day", "profit", "user", "service"] as const;
export type ReportView = (typeof REPORT_VIEWS)[number];

export const MAX_RANGE_DAYS = 366;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: string | undefined): s is string {
  if (!s || !ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * Resolve the requested range. Defaults to the current month up to today.
 * Reversed dates are swapped; ranges longer than a year are cut to a year
 * ending on `to`; future end dates are clamped to today.
 */
export function resolveRange(fromRaw: string | undefined, toRaw: string | undefined, today: string): { from: string; to: string } {
  let to = isValidDate(toRaw) ? toRaw : today;
  let from = isValidDate(fromRaw) ? fromRaw : monthStart(to);
  if (to > today) to = today;
  if (from > to) [from, to] = [to, from];
  if (daysBetween(from, to) >= MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
  return { from, to };
}

export function resolveView(v: string | undefined): ReportView {
  return (REPORT_VIEWS as readonly string[]).includes(v ?? "") ? (v as ReportView) : "day";
}

/** Quick ranges shown above the report. */
export function presets(today: string): { label: string; from: string; to: string }[] {
  const lastMonthEnd = addDays(monthStart(today), -1);
  return [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: addDays(today, -1), to: addDays(today, -1) },
    { label: "Last 7 days", from: addDays(today, -6), to: today },
    { label: "This month", from: monthStart(today), to: today },
    { label: "Last month", from: monthStart(lastMonthEnd), to: lastMonthEnd },
  ];
}

/** Paise → plain rupees for spreadsheets ("1234.50"), no symbol or grouping. */
export function paiseToRupees(paise: bigint | number | string): string {
  const p = BigInt(paise);
  const neg = p < 0n;
  const abs = neg ? -p : p;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  // Stop spreadsheet formula injection from names typed into the system.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
