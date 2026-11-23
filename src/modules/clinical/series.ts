import { seriesKey } from "./constants";

export interface MeasurementRow {
  id: string; measured_on: string; kind: string; body_region: string; side: string; movement: string;
  value: string; unit: string; observation: string | null; author_name: string; appointment_id: string | null;
  voided_at: Date | null; voided_by: string | null; void_reason: string | null; created_at: Date;
}

export interface Series {
  key: string; kind: string; body_region: string; side: string; movement: string; unit: string;
  points: MeasurementRow[];          // valid points, oldest first
  voided: MeasurementRow[];          // struck-out entries, kept visible
  baseline: MeasurementRow | null;
  latest: MeasurementRow | null;
  change: number | null;             // latest − baseline, same unit only
}

/**
 * Group measurements into comparable series. Only identical region + side +
 * movement + unit are compared; anything else stays a separate, labelled series.
 * Entries marked as entered in error never count as baseline or latest.
 */
export function buildSeries(rows: MeasurementRow[]): Series[] {
  const map = new Map<string, Series>();
  const sorted = [...rows].sort((a, b) => a.measured_on.localeCompare(b.measured_on) || +new Date(a.created_at) - +new Date(b.created_at));
  for (const r of sorted) {
    const key = seriesKey(r);
    let s = map.get(key);
    if (!s) {
      s = { key, kind: r.kind, body_region: r.body_region, side: r.side, movement: r.movement, unit: r.unit, points: [], voided: [], baseline: null, latest: null, change: null };
      map.set(key, s);
    }
    (r.voided_at ? s.voided : s.points).push(r);
  }
  for (const s of map.values()) {
    s.baseline = s.points[0] ?? null;
    s.latest = s.points.length > 1 ? s.points[s.points.length - 1] : null;
    s.change = s.baseline && s.latest ? Math.round((Number(s.latest.value) - Number(s.baseline.value)) * 100) / 100 : null;
  }
  return [...map.values()].sort((a, b) => a.body_region.localeCompare(b.body_region) || a.movement.localeCompare(b.movement) || a.side.localeCompare(b.side));
}
