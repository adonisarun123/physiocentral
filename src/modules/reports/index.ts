import "server-only";
import { q } from "@/lib/db";
import { assertPermission, type StaffActor } from "@/modules/auth/actor";
import { dayTable, expenseCategoryTable, profitTable, serviceTable, staffTable, therapistTable, type Table } from "./tables";
import type { ReportView } from "./range";

/**
 * Operational reports for the owner and billing desk: day-wise, user-wise and
 * service-wise. Counts and money only — no diagnosis or note content.
 *
 * Definitions (all dates are IST calendar days):
 * - Visits: appointments by their start date. Completed / no-show / cancelled.
 * - Billed: ISSUED invoices by issue date (voided bills excluded). Credit notes
 *   are shown separately on the day they were raised.
 * - Collected: VERIFIED payments by the date received. Pending, failed and
 *   reversed (entry-error) payments are excluded.
 * - Refunded: refunds by the date the money was paid back.
 * - Expenses: recorded (not voided) expenses by the date paid.
 * - Profit: net collected − expenses (cash basis: money in minus money out).
 * All money values are returned as paise strings.
 */

const TZ = "Asia/Kolkata";

export type DayRow = {
  day: string; completed: number; no_show: number; cancelled: number; new_patients: number;
  billed_paise: string; credited_paise: string;
  cash_paise: string; upi_paise: string; other_paise: string; collected_paise: string;
  refunded_paise: string; net_paise: string; expenses_paise: string; profit_paise: string;
};

export async function dayWise(actor: StaffActor, from: string, to: string): Promise<DayRow[]> {
  assertPermission(actor, "FINANCE_VIEW");
  return q<DayRow>(
    `WITH days AS (SELECT d::date AS day FROM generate_series($2::date, $3::date, interval '1 day') d),
     visits AS (
       SELECT (a.starts_at AT TIME ZONE '${TZ}')::date AS day,
              count(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
              count(*) FILTER (WHERE a.status = 'NO_SHOW')::int AS no_show,
              count(*) FILTER (WHERE a.status = 'CANCELLED')::int AS cancelled
         FROM appointment a
        WHERE a.organization_id = $1
          AND a.starts_at >= ($2::date::timestamp AT TIME ZONE '${TZ}')
          AND a.starts_at <  (($3::date + 1)::timestamp AT TIME ZONE '${TZ}')
        GROUP BY 1),
     firsts AS (
       SELECT (min(a.starts_at) AT TIME ZONE '${TZ}')::date AS day, a.patient_id
         FROM appointment a WHERE a.organization_id = $1 AND a.status = 'COMPLETED' GROUP BY a.patient_id),
     newp AS (SELECT day, count(*)::int AS n FROM firsts GROUP BY day),
     billed AS (
       SELECT (i.issued_at AT TIME ZONE '${TZ}')::date AS day, sum(i.total_paise) AS amt
         FROM invoice i WHERE i.organization_id = $1 AND i.status = 'ISSUED' GROUP BY 1),
     credited AS (
       SELECT (c.created_at AT TIME ZONE '${TZ}')::date AS day, sum(c.amount_paise) AS amt
         FROM credit_note c WHERE c.organization_id = $1 GROUP BY 1),
     paid AS (
       SELECT p.received_on AS day,
              sum(p.amount_paise) FILTER (WHERE p.method = 'CASH') AS cash,
              sum(p.amount_paise) FILTER (WHERE p.method = 'UPI_MANUAL') AS upi,
              sum(p.amount_paise) FILTER (WHERE p.method NOT IN ('CASH','UPI_MANUAL')) AS other,
              sum(p.amount_paise) AS total
         FROM payment p WHERE p.organization_id = $1 AND p.status = 'VERIFIED'
          AND p.received_on BETWEEN $2::date AND $3::date GROUP BY 1),
     refunded AS (
       SELECT r.refunded_on AS day, sum(r.amount_paise) AS amt
         FROM payment_refund r WHERE r.organization_id = $1
          AND r.refunded_on BETWEEN $2::date AND $3::date GROUP BY 1),
     spent AS (
       SELECT e.spent_on AS day, sum(e.amount_paise) AS amt
         FROM expense e WHERE e.organization_id = $1 AND e.status = 'RECORDED'
          AND e.spent_on BETWEEN $2::date AND $3::date GROUP BY 1)
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            COALESCE(v.completed, 0) AS completed, COALESCE(v.no_show, 0) AS no_show, COALESCE(v.cancelled, 0) AS cancelled,
            COALESCE(n.n, 0) AS new_patients,
            COALESCE(b.amt, 0)::text AS billed_paise, COALESCE(c.amt, 0)::text AS credited_paise,
            COALESCE(p.cash, 0)::text AS cash_paise, COALESCE(p.upi, 0)::text AS upi_paise, COALESCE(p.other, 0)::text AS other_paise,
            COALESCE(p.total, 0)::text AS collected_paise, COALESCE(r.amt, 0)::text AS refunded_paise,
            (COALESCE(p.total, 0) - COALESCE(r.amt, 0))::text AS net_paise,
            COALESCE(x.amt, 0)::text AS expenses_paise,
            (COALESCE(p.total, 0) - COALESCE(r.amt, 0) - COALESCE(x.amt, 0))::text AS profit_paise
       FROM days d
       LEFT JOIN visits v ON v.day = d.day LEFT JOIN newp n ON n.day = d.day
       LEFT JOIN billed b ON b.day = d.day LEFT JOIN credited c ON c.day = d.day
       LEFT JOIN paid p ON p.day = d.day LEFT JOIN refunded r ON r.day = d.day
       LEFT JOIN spent x ON x.day = d.day
      ORDER BY d.day DESC`,
    [actor.organizationId, from, to],
  );
}

export type TherapistRow = {
  therapist_id: string | null; therapist: string; completed: number; no_show: number; cancelled: number;
  patients: number; billed_paise: string;
};

export type StaffRow = {
  key: string; name: string; bookings: number;
  payments_recorded: number; recorded_paise: string;
  payments_verified: number; verified_paise: string;
  invoices_issued: number; issued_paise: string;
  refunds: number; refunded_paise: string;
};

/** "User-wise": per physiotherapist (treatment side) and per staff login (desk side). */
export async function userWise(actor: StaffActor, from: string, to: string) {
  assertPermission(actor, "FINANCE_VIEW");
  const org = actor.organizationId;
  const [therapists, staff] = await Promise.all([
    q<TherapistRow>(
      `WITH appts AS (
         SELECT a.therapist_id, a.patient_id, a.status FROM appointment a
          WHERE a.organization_id = $1
            AND a.starts_at >= ($2::date::timestamp AT TIME ZONE '${TZ}')
            AND a.starts_at <  (($3::date + 1)::timestamp AT TIME ZONE '${TZ}')
            AND a.status IN ('COMPLETED','NO_SHOW','CANCELLED')),
       billed AS (
         SELECT a.therapist_id, sum(il.total_paise) AS amt
           FROM invoice_line il JOIN invoice i ON i.id = il.invoice_id
           JOIN billable_charge bc ON bc.id = il.billable_charge_id
           LEFT JOIN appointment a ON a.id = bc.appointment_id
          WHERE i.organization_id = $1 AND i.status = 'ISSUED'
            AND i.issued_at >= ($2::date::timestamp AT TIME ZONE '${TZ}')
            AND i.issued_at <  (($3::date + 1)::timestamp AT TIME ZONE '${TZ}')
          GROUP BY a.therapist_id),
       agg AS (
         SELECT therapist_id,
                count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
                count(*) FILTER (WHERE status = 'NO_SHOW')::int AS no_show,
                count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
                count(DISTINCT patient_id) FILTER (WHERE status = 'COMPLETED')::int AS patients
           FROM appts GROUP BY therapist_id),
       keys AS (SELECT therapist_id FROM agg UNION SELECT therapist_id FROM billed)
       SELECT k.therapist_id, COALESCE(t.display_name, 'No physio on record') AS therapist,
              COALESCE(g.completed, 0) AS completed, COALESCE(g.no_show, 0) AS no_show, COALESCE(g.cancelled, 0) AS cancelled,
              COALESCE(g.patients, 0) AS patients, COALESCE(b.amt, 0)::text AS billed_paise
         FROM keys k
         LEFT JOIN therapist t ON t.id = k.therapist_id
         LEFT JOIN agg g ON g.therapist_id IS NOT DISTINCT FROM k.therapist_id
         LEFT JOIN billed b ON b.therapist_id IS NOT DISTINCT FROM k.therapist_id
        ORDER BY (k.therapist_id IS NULL), COALESCE(g.completed, 0) DESC, therapist`,
      [org, from, to],
    ),
    q<StaffRow>(
      `WITH bookings AS (
         SELECT CASE WHEN a.created_by LIKE 'staff:%' THEN a.created_by ELSE 'online' END AS key, count(*)::int AS n
           FROM appointment a
          WHERE a.organization_id = $1
            AND a.created_at >= ($2::date::timestamp AT TIME ZONE '${TZ}')
            AND a.created_at <  (($3::date + 1)::timestamp AT TIME ZONE '${TZ}')
          GROUP BY 1),
       recorded AS (
         SELECT p.recorded_by AS key, count(*)::int AS n, sum(p.amount_paise) AS amt
           FROM payment p WHERE p.organization_id = $1 AND p.status IN ('PENDING','VERIFIED')
            AND p.received_on BETWEEN $2::date AND $3::date GROUP BY 1),
       verified AS (
         SELECT p.verified_by AS key, count(*)::int AS n, sum(p.amount_paise) AS amt
           FROM payment p WHERE p.organization_id = $1 AND p.status = 'VERIFIED'
            AND p.verified_at >= ($2::date::timestamp AT TIME ZONE '${TZ}')
            AND p.verified_at <  (($3::date + 1)::timestamp AT TIME ZONE '${TZ}')
          GROUP BY 1),
       issued AS (
         SELECT i.issued_by AS key, count(*)::int AS n, sum(i.total_paise) AS amt
           FROM invoice i WHERE i.organization_id = $1 AND i.status = 'ISSUED'
            AND i.issued_at >= ($2::date::timestamp AT TIME ZONE '${TZ}')
            AND i.issued_at <  (($3::date + 1)::timestamp AT TIME ZONE '${TZ}')
          GROUP BY 1),
       refunds AS (
         SELECT r.approved_by AS key, count(*)::int AS n, sum(r.amount_paise) AS amt
           FROM payment_refund r WHERE r.organization_id = $1
            AND r.refunded_on BETWEEN $2::date AND $3::date GROUP BY 1),
       keys AS (SELECT key FROM bookings UNION SELECT key FROM recorded UNION SELECT key FROM verified
                UNION SELECT key FROM issued UNION SELECT key FROM refunds)
       SELECT k.key,
              CASE WHEN k.key = 'online' THEN 'Website / online requests'
                   ELSE COALESCE(s.display_name, 'Unknown login') END AS name,
              COALESCE(bk.n, 0) AS bookings,
              COALESCE(rc.n, 0) AS payments_recorded, COALESCE(rc.amt, 0)::text AS recorded_paise,
              COALESCE(vf.n, 0) AS payments_verified, COALESCE(vf.amt, 0)::text AS verified_paise,
              COALESCE(iss.n, 0) AS invoices_issued, COALESCE(iss.amt, 0)::text AS issued_paise,
              COALESCE(rf.n, 0) AS refunds, COALESCE(rf.amt, 0)::text AS refunded_paise
         FROM keys k
         LEFT JOIN staff_member s ON k.key = 'staff:' || s.id::text AND s.organization_id = $1
         LEFT JOIN bookings bk ON bk.key = k.key LEFT JOIN recorded rc ON rc.key = k.key
         LEFT JOIN verified vf ON vf.key = k.key LEFT JOIN issued iss ON iss.key = k.key
         LEFT JOIN refunds rf ON rf.key = k.key
        WHERE k.key IS NOT NULL
        ORDER BY (k.key = 'online'), name`,
      [org, from, to],
    ),
  ]);
  return { therapists, staff };
}

export type ServiceRow = {
  service_id: string | null; service: string; completed: number; no_show: number; cancelled: number;
  units_billed: string; billed_paise: string; avg_paise: string;
};

export async function serviceWise(actor: StaffActor, from: string, to: string): Promise<ServiceRow[]> {
  assertPermission(actor, "FINANCE_VIEW");
  return q<ServiceRow>(
    `WITH visits AS (
       SELECT a.service_id,
              count(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
              count(*) FILTER (WHERE a.status = 'NO_SHOW')::int AS no_show,
              count(*) FILTER (WHERE a.status = 'CANCELLED')::int AS cancelled
         FROM appointment a
        WHERE a.organization_id = $1
          AND a.starts_at >= ($2::date::timestamp AT TIME ZONE '${TZ}')
          AND a.starts_at <  (($3::date + 1)::timestamp AT TIME ZONE '${TZ}')
          AND a.status IN ('COMPLETED','NO_SHOW','CANCELLED')
        GROUP BY a.service_id),
     billed AS (
       SELECT bc.service_id, sum(il.quantity) AS units, sum(il.total_paise) AS amt
         FROM invoice_line il JOIN invoice i ON i.id = il.invoice_id
         JOIN billable_charge bc ON bc.id = il.billable_charge_id
        WHERE i.organization_id = $1 AND i.status = 'ISSUED'
          AND i.issued_at >= ($2::date::timestamp AT TIME ZONE '${TZ}')
          AND i.issued_at <  (($3::date + 1)::timestamp AT TIME ZONE '${TZ}')
        GROUP BY bc.service_id),
     keys AS (SELECT service_id FROM visits UNION SELECT service_id FROM billed)
     SELECT k.service_id, COALESCE(s.name, 'Other charges (not linked to a service)') AS service,
            COALESCE(v.completed, 0) AS completed, COALESCE(v.no_show, 0) AS no_show, COALESCE(v.cancelled, 0) AS cancelled,
            COALESCE(b.units, 0)::float8::text AS units_billed,
            COALESCE(b.amt, 0)::text AS billed_paise,
            CASE WHEN COALESCE(b.units, 0) > 0 THEN round(b.amt / b.units)::bigint ELSE 0 END::text AS avg_paise
       FROM keys k
       LEFT JOIN service s ON s.id = k.service_id
       LEFT JOIN visits v ON v.service_id IS NOT DISTINCT FROM k.service_id
       LEFT JOIN billed b ON b.service_id IS NOT DISTINCT FROM k.service_id
      ORDER BY (k.service_id IS NULL), COALESCE(b.amt, 0) DESC, COALESCE(v.completed, 0) DESC, service`,
    [actor.organizationId, from, to],
  );
}

export type ProfitSummary = {
  billed_paise: string; credited_paise: string; collected_paise: string; refunded_paise: string; net_paise: string;
  expenses_paise: string; profit_paise: string; outstanding_paise: string;
};
export type ExpenseCategoryRow = { category: string; entries: number; amount_paise: string };

/** Profit & expenses for a period: money in, money out, and spending by category. */
export async function profitAndExpenses(actor: StaffActor, from: string, to: string) {
  assertPermission(actor, "FINANCE_VIEW");
  const org = actor.organizationId;
  const [summary, categories] = await Promise.all([
    q<ProfitSummary>(
      `WITH b AS (SELECT COALESCE(sum(total_paise), 0) amt FROM invoice WHERE organization_id = $1 AND status = 'ISSUED'
                    AND issued_at >= ($2::date::timestamp AT TIME ZONE '${TZ}') AND issued_at < (($3::date + 1)::timestamp AT TIME ZONE '${TZ}')),
            c AS (SELECT COALESCE(sum(amount_paise), 0) amt FROM credit_note WHERE organization_id = $1
                    AND created_at >= ($2::date::timestamp AT TIME ZONE '${TZ}') AND created_at < (($3::date + 1)::timestamp AT TIME ZONE '${TZ}')),
            p AS (SELECT COALESCE(sum(amount_paise), 0) amt FROM payment WHERE organization_id = $1 AND status = 'VERIFIED'
                    AND received_on BETWEEN $2::date AND $3::date),
            r AS (SELECT COALESCE(sum(amount_paise), 0) amt FROM payment_refund WHERE organization_id = $1
                    AND refunded_on BETWEEN $2::date AND $3::date),
            x AS (SELECT COALESCE(sum(amount_paise), 0) amt FROM expense WHERE organization_id = $1 AND status = 'RECORDED'
                    AND spent_on BETWEEN $2::date AND $3::date),
            o AS (SELECT COALESCE(sum(amount_due_paise), 0) amt FROM invoice_balance WHERE organization_id = $1)
       SELECT b.amt::text billed_paise, c.amt::text credited_paise, p.amt::text collected_paise, r.amt::text refunded_paise,
              (p.amt - r.amt)::text net_paise, x.amt::text expenses_paise, (p.amt - r.amt - x.amt)::text profit_paise, o.amt::text outstanding_paise
         FROM b, c, p, r, x, o`,
      [org, from, to]),
    q<ExpenseCategoryRow>(
      `SELECT category, count(*)::int entries, sum(amount_paise)::text amount_paise
         FROM expense WHERE organization_id = $1 AND status = 'RECORDED' AND spent_on BETWEEN $2::date AND $3::date
        GROUP BY category ORDER BY sum(amount_paise) DESC`,
      [org, from, to]),
  ]);
  return { summary: summary[0], categories };
}

/** Load one report view as display/CSV tables. */
export async function loadReportTables(
  actor: StaffActor, view: ReportView, from: string, to: string, money: (paise: string) => string,
): Promise<Table[]> {
  if (view === "day") return [dayTable(await dayWise(actor, from, to), money)];
  if (view === "profit") {
    const { summary, categories } = await profitAndExpenses(actor, from, to);
    return [profitTable(summary, money), expenseCategoryTable(categories, money)];
  }
  if (view === "service") return [serviceTable(await serviceWise(actor, from, to), money)];
  const { therapists, staff } = await userWise(actor, from, to);
  return [therapistTable(therapists, money), staffTable(staff, money)];
}
