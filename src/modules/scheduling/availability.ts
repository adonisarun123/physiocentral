import { q, type Db, getPool } from "@/lib/db";

export interface SlotQuery {
  branchId: string;
  serviceId: string;
  therapistId?: string | null; // null = any eligible therapist
  date?: string | null;        // YYYY-MM-DD in branch local time
  exactStart?: string | null;  // ISO instant, validate a single slot
  enforceLeadTime: boolean;    // patient requests: yes; staff acceptance: only "not in the past"
}

export interface Slot {
  therapist_id: string;
  resource_id: string;
  starts_at: Date;
  ends_at: Date;
}

/**
 * Availability is computed in SQL in the branch's IANA timezone (§6.3):
 * recurring local working hours → absolute instants via AT TIME ZONE, minus
 * active reservations (incl. buffers, half-open ranges) and dated exceptions.
 * Therapist capacity is global: reservations are checked on the therapist's
 * resource regardless of branch, so cross-branch double booking is impossible.
 * This is advisory for display; the exclusion constraint is the final guard.
 */
export async function findSlots(params: SlotQuery, db: Db = getPool()): Promise<Slot[]> {
  return q<Slot>(
    `
WITH p AS (
  SELECT b.id AS branch_id, b.timezone AS tz, b.slot_step_minutes AS step,
         b.booking_lead_minutes AS lead, b.booking_horizon_days AS horizon,
         COALESCE($4::date, ($5::timestamptz AT TIME ZONE b.timezone)::date) AS d
    FROM branch b WHERE b.id = $1
),
s AS (
  SELECT duration_minutes AS dur, buffer_before_minutes AS bb, buffer_after_minutes AS ba
    FROM service WHERE id = $2 AND status = 'ACTIVE' AND bookable
),
ther AS (
  SELECT t.id AS therapist_id, t.resource_id
    FROM therapist t
    JOIN resource r ON r.id = t.resource_id AND r.active
    JOIN therapist_branch tb ON tb.therapist_id = t.id AND tb.branch_id = $1
    JOIN therapist_skill ts ON ts.therapist_id = t.id AND ts.service_id = $2
   WHERE t.active AND ($3::uuid IS NULL OR t.id = $3::uuid)
),
win AS (
  SELECT th.therapist_id, th.resource_id,
         ((p.d + ar.start_local) AT TIME ZONE p.tz) AS ws,
         ((p.d + ar.end_local)   AT TIME ZONE p.tz) AS we
    FROM ther th
    JOIN availability_rule ar ON ar.resource_id = th.resource_id AND ar.branch_id = $1
    CROSS JOIN p
   WHERE ar.weekday = EXTRACT(DOW FROM p.d)
),
cand AS (
  SELECT w.therapist_id, w.resource_id, gs AS starts_at,
         gs + make_interval(mins => s.dur) AS ends_at,
         tstzrange(gs - make_interval(mins => s.bb), gs + make_interval(mins => s.dur + s.ba), '[)') AS occ
    FROM win w CROSS JOIN s CROSS JOIN p
    CROSS JOIN LATERAL generate_series(w.ws, w.we - make_interval(mins => s.dur), make_interval(mins => p.step)) AS gs
)
SELECT c.therapist_id, c.resource_id, c.starts_at, c.ends_at
  FROM cand c CROSS JOIN p
 WHERE ($5::timestamptz IS NULL OR c.starts_at = $5::timestamptz)
   AND c.starts_at > now()
   AND (NOT $6::boolean OR c.starts_at >= now() + make_interval(mins => p.lead))
   AND c.starts_at < now() + make_interval(days => p.horizon)
   AND NOT EXISTS (
         SELECT 1 FROM resource_reservation rr
          WHERE rr.resource_id = c.resource_id
            AND rr.state IN ('HELD','CONFIRMED')
            AND (rr.state = 'CONFIRMED' OR rr.expires_at > now())
            AND rr.occupied_at && c.occ)
   AND NOT EXISTS (
         SELECT 1 FROM availability_exception e
          WHERE (e.resource_id = c.resource_id OR e.branch_id = p.branch_id)
            AND e.blocked && c.occ)
 ORDER BY c.starts_at, c.therapist_id
 LIMIT 500`,
    [
      params.branchId,
      params.serviceId,
      params.therapistId ?? null,
      params.date ?? null,
      params.exactStart ?? null,
      params.enforceLeadTime,
    ],
    db,
  );
}

/** Collapse to one entry per start time for "Any available" display. */
export function distinctStarts(slots: Slot[]): Slot[] {
  const seen = new Set<number>();
  return slots.filter((s) => {
    const t = new Date(s.starts_at).getTime();
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}
