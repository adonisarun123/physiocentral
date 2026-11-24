/**
 * Turn report rows into header + cell arrays, shared by the on-screen tables
 * and the CSV export so the two can never disagree. Pure: no DB access.
 * `money` decides how paise are shown (₹ formatting on screen, plain rupees in CSV).
 */
type Money = (paise: string) => string;
export type Table = { title: string; header: string[]; numeric: boolean[]; rows: string[][]; totals: string[] | null };

type DayIn = {
  day: string; completed: number; no_show: number; cancelled: number; new_patients: number;
  billed_paise: string; credited_paise: string; cash_paise: string; upi_paise: string; other_paise: string;
  collected_paise: string; refunded_paise: string; net_paise: string;
};
type TherapistIn = { therapist: string; completed: number; no_show: number; cancelled: number; patients: number; billed_paise: string };
type StaffIn = {
  name: string; bookings: number; payments_recorded: number; recorded_paise: string; payments_verified: number; verified_paise: string;
  invoices_issued: number; issued_paise: string; refunds: number; refunded_paise: string;
};
type ServiceIn = { service: string; completed: number; no_show: number; cancelled: number; units_billed: string; billed_paise: string; avg_paise: string };

const sumInt = <T>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);
const sumPaise = <T>(rows: T[], f: (r: T) => string) => rows.reduce((a, r) => a + BigInt(f(r)), 0n).toString();

export function dayTable(rows: DayIn[], money: Money): Table {
  const header = ["Date", "Visits done", "No-shows", "Cancelled", "New patients", "Billed", "Credit notes", "Cash", "UPI", "Bank / other", "Collected", "Refunded", "Net collected"];
  const cells = (r: DayIn) => [
    String(r.completed), String(r.no_show), String(r.cancelled), String(r.new_patients),
    money(r.billed_paise), money(r.credited_paise), money(r.cash_paise), money(r.upi_paise), money(r.other_paise),
    money(r.collected_paise), money(r.refunded_paise), money(r.net_paise),
  ];
  const total: DayIn = {
    day: "Total",
    completed: sumInt(rows, (r) => r.completed), no_show: sumInt(rows, (r) => r.no_show), cancelled: sumInt(rows, (r) => r.cancelled),
    new_patients: sumInt(rows, (r) => r.new_patients),
    billed_paise: sumPaise(rows, (r) => r.billed_paise), credited_paise: sumPaise(rows, (r) => r.credited_paise),
    cash_paise: sumPaise(rows, (r) => r.cash_paise), upi_paise: sumPaise(rows, (r) => r.upi_paise), other_paise: sumPaise(rows, (r) => r.other_paise),
    collected_paise: sumPaise(rows, (r) => r.collected_paise), refunded_paise: sumPaise(rows, (r) => r.refunded_paise), net_paise: sumPaise(rows, (r) => r.net_paise),
  };
  return {
    title: "Day-wise summary", header, numeric: header.map((_, i) => i > 0),
    rows: rows.map((r) => [r.day, ...cells(r)]),
    totals: rows.length ? ["Total", ...cells(total)] : null,
  };
}

export function therapistTable(rows: TherapistIn[], money: Money): Table {
  const header = ["Physiotherapist", "Visits done", "Patients seen", "No-shows", "Cancelled", "Billed for their visits"];
  const cells = (r: TherapistIn) => [String(r.completed), String(r.patients), String(r.no_show), String(r.cancelled), money(r.billed_paise)];
  return {
    title: "By physiotherapist", header, numeric: header.map((_, i) => i > 0),
    rows: rows.map((r) => [r.therapist, ...cells(r)]),
    totals: rows.length ? ["Total", String(sumInt(rows, (r) => r.completed)), "—", String(sumInt(rows, (r) => r.no_show)),
      String(sumInt(rows, (r) => r.cancelled)), money(sumPaise(rows, (r) => r.billed_paise))] : null,
  };
}

export function staffTable(rows: StaffIn[], money: Money): Table {
  const header = ["Staff login", "Bookings made", "Payments recorded", "Amount recorded", "Payments verified", "Amount verified", "Bills issued", "Amount billed", "Refunds approved", "Amount refunded"];
  const cells = (r: StaffIn) => [
    String(r.bookings), String(r.payments_recorded), money(r.recorded_paise), String(r.payments_verified), money(r.verified_paise),
    String(r.invoices_issued), money(r.issued_paise), String(r.refunds), money(r.refunded_paise),
  ];
  const total: StaffIn = {
    name: "Total", bookings: sumInt(rows, (r) => r.bookings),
    payments_recorded: sumInt(rows, (r) => r.payments_recorded), recorded_paise: sumPaise(rows, (r) => r.recorded_paise),
    payments_verified: sumInt(rows, (r) => r.payments_verified), verified_paise: sumPaise(rows, (r) => r.verified_paise),
    invoices_issued: sumInt(rows, (r) => r.invoices_issued), issued_paise: sumPaise(rows, (r) => r.issued_paise),
    refunds: sumInt(rows, (r) => r.refunds), refunded_paise: sumPaise(rows, (r) => r.refunded_paise),
  };
  return {
    title: "By staff login", header, numeric: header.map((_, i) => i > 0),
    rows: rows.map((r) => [r.name, ...cells(r)]),
    totals: rows.length ? ["Total", ...cells(total)] : null,
  };
}

export function serviceTable(rows: ServiceIn[], money: Money): Table {
  const header = ["Service", "Visits done", "No-shows", "Cancelled", "Units billed", "Billed", "Average per unit"];
  return {
    title: "By service", header, numeric: header.map((_, i) => i > 0),
    rows: rows.map((r) => [r.service, String(r.completed), String(r.no_show), String(r.cancelled), r.units_billed, money(r.billed_paise), money(r.avg_paise)]),
    totals: rows.length ? ["Total", String(sumInt(rows, (r) => r.completed)), String(sumInt(rows, (r) => r.no_show)),
      String(sumInt(rows, (r) => r.cancelled)), "—", money(sumPaise(rows, (r) => r.billed_paise)), "—"] : null,
  };
}
