import { q, q1 } from "@/lib/db";

export interface PackageRow {
  id: string;
  public_ref: string;
  name: string;
  status: "ACTIVE" | "CLOSED";
  sessions_total: number;
  price_paise: string | null;
  created_at: Date;
  patient_id: string;
  patient: string;
  patient_ref: string;
  phone: string | null;
  /** Visits completed. */
  done: number;
  /** Booked, not yet completed (confirmed / checked in / in progress). */
  upcoming: number;
  /** Missed visits — they still use up a place in the package. */
  no_show: number;
  first_at: Date | null;
  last_at: Date | null;
  next_at: Date | null;
}

const BASE = `
  SELECT k.id, k.public_ref, k.name, k.status, k.sessions_total, k.price_paise::text, k.created_at, k.patient_id,
         p.full_name patient, p.public_ref patient_ref,
         (SELECT value FROM patient_contact c WHERE c.patient_id=p.id AND c.kind='PHONE' ORDER BY preferred DESC LIMIT 1) phone,
         count(a.id) FILTER (WHERE a.status='COMPLETED')::int done,
         count(a.id) FILTER (WHERE a.status IN ('CONFIRMED','CHECKED_IN','IN_PROGRESS','REQUESTED','AWAITING_PATIENT_CONFIRMATION','AWAITING_DEPOSIT'))::int upcoming,
         count(a.id) FILTER (WHERE a.status='NO_SHOW')::int no_show,
         min(a.starts_at) FILTER (WHERE a.status NOT IN ('CANCELLED','REJECTED')) first_at,
         max(a.starts_at) FILTER (WHERE a.status NOT IN ('CANCELLED','REJECTED')) last_at,
         min(a.starts_at) FILTER (WHERE a.status IN ('CONFIRMED','CHECKED_IN','IN_PROGRESS') AND a.ends_at > now()) next_at
    FROM patient_package k
    JOIN patient p ON p.id=k.patient_id
    LEFT JOIN appointment a ON a.package_id=k.id`;
const GROUP = ` GROUP BY k.id, p.id`;

/** Packages for the organisation, newest first. `view`: active (default), finished/closed, or all. */
export function listPackages(orgId: string, opts: { patientId?: string; view?: "active" | "finished" | "all"; term?: string } = {}) {
  const view = opts.patientId ? "all" : opts.view ?? "active";
  const having =
    view === "active" ? ` HAVING k.status='ACTIVE' AND count(a.id) FILTER (WHERE a.status IN ('COMPLETED','NO_SHOW')) < k.sessions_total`
    : view === "finished" ? ` HAVING NOT (k.status='ACTIVE' AND count(a.id) FILTER (WHERE a.status IN ('COMPLETED','NO_SHOW')) < k.sessions_total)`
    : "";
  const t = (opts.term ?? "").trim();
  return q<PackageRow>(
    `${BASE} WHERE k.organization_id=$1 AND ($2::uuid IS NULL OR k.patient_id=$2)
        AND ($3 = '' OR p.full_name ILIKE '%'||$3||'%' OR p.public_ref ILIKE '%'||$3||'%' OR k.public_ref ILIKE '%'||$3||'%')
     ${GROUP}${having} ORDER BY next_at NULLS LAST, k.created_at DESC LIMIT 200`,
    [orgId, opts.patientId ?? null, t],
  );
}

export function getPackage(orgId: string, id: string) {
  return q1<PackageRow>(`${BASE} WHERE k.organization_id=$1 AND k.id=$2 ${GROUP}`, [orgId, id]);
}

/** Sessions in a package, numbered in date order (cancelled ones listed but not numbered). */
export function packageSessions(packageId: string) {
  return q<{ id: string; public_ref: string; starts_at: Date; ends_at: Date; status: string; therapist: string | null; n: number | null }>(
    `SELECT a.id, a.public_ref, a.starts_at, a.ends_at, a.status, t.display_name therapist,
            CASE WHEN a.status IN ('CANCELLED','REJECTED') THEN NULL
                 ELSE row_number() OVER (PARTITION BY (a.status IN ('CANCELLED','REJECTED')) ORDER BY a.starts_at) END::int n
       FROM appointment a LEFT JOIN therapist t ON t.id=a.therapist_id
      WHERE a.package_id=$1 ORDER BY a.starts_at`,
    [packageId],
  );
}
