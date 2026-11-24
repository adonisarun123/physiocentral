/** Clinical vocabulary shared by services and forms. No server imports here. */

export const BODY_REGIONS = [
  "Neck (cervical)", "Upper back (thoracic)", "Lower back (lumbar)", "Pelvis / SI joint", "Jaw (TMJ)",
  "Shoulder", "Elbow", "Wrist / hand", "Hip", "Knee", "Ankle / foot", "Whole body / general", "Other",
] as const;

export const SIDES = [
  { value: "LEFT", label: "Left" },
  { value: "RIGHT", label: "Right" },
  { value: "BILATERAL", label: "Both sides" },
  { value: "NOT_APPLICABLE", label: "Not applicable (midline)" },
] as const;
export type Side = (typeof SIDES)[number]["value"];

export const MEASUREMENT_KINDS = [
  { value: "PAIN", label: "Pain" },
  { value: "ROM", label: "Range of motion" },
  { value: "STRENGTH", label: "Strength" },
  { value: "FUNCTION", label: "Functional test" },
  { value: "OTHER", label: "Other" },
] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number]["value"];

/** Each unit is its own scale. Values on different units are never compared. */
export const UNITS = {
  NPRS_0_10: { label: "Pain score (0–10 NPRS)", short: "/10", min: 0, max: 10, step: 1, kinds: ["PAIN"] },
  DEGREES: { label: "Degrees (goniometer)", short: "°", min: -90, max: 360, step: 1, kinds: ["ROM"] },
  MMT_0_5: { label: "Manual muscle test (0–5)", short: "/5 MMT", min: 0, max: 5, step: 0.5, kinds: ["STRENGTH"] },
  KG: { label: "Kilograms (dynamometer)", short: "kg", min: 0, max: 500, step: 0.1, kinds: ["STRENGTH", "FUNCTION", "OTHER"] },
  CM: { label: "Centimetres", short: "cm", min: 0, max: 1000, step: 0.1, kinds: ["ROM", "FUNCTION", "OTHER"] },
  SECONDS: { label: "Seconds", short: "s", min: 0, max: 36000, step: 0.1, kinds: ["FUNCTION", "OTHER"] },
  REPS: { label: "Repetitions", short: "reps", min: 0, max: 10000, step: 1, kinds: ["FUNCTION", "STRENGTH", "OTHER"] },
  SCORE: { label: "Outcome score (questionnaire)", short: "score", min: 0, max: 1000, step: 0.1, kinds: ["FUNCTION", "PAIN", "OTHER"] },
} as const;
export type Unit = keyof typeof UNITS;
export const UNIT_KEYS = Object.keys(UNITS) as Unit[];

export const GOAL_STATUSES = [
  { value: "ACTIVE", label: "In progress" },
  { value: "ACHIEVED", label: "Achieved" },
  { value: "DISCONTINUED", label: "Discontinued" },
] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number]["value"];

export const sideLabel = (v: string | null | undefined) => SIDES.find((s) => s.value === v)?.label ?? "—";
export const kindLabel = (v: string) => MEASUREMENT_KINDS.find((k) => k.value === v)?.label ?? v;
export const goalStatusLabel = (v: string) => GOAL_STATUSES.find((g) => g.value === v)?.label ?? v;
export const unitShort = (u: string) => (UNITS as Record<string, { short: string }>)[u]?.short ?? u;

/** "85°", "6/10", "4/5 MMT", "12.5 kg". Value comes from numeric(8,2) as text. */
export function formatMeasure(value: string | number, unit: string) {
  const n = Number(value);
  const v = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
  const s = unitShort(unit);
  return s === "°" ? `${v}°` : s.startsWith("/") ? `${v}${s}` : `${v} ${s}`;
}

/** The identity of a comparable series. */
export const seriesKey = (m: { body_region: string; side: string; movement: string; unit: string }) =>
  [m.body_region, m.side, m.movement.trim().toLowerCase(), m.unit].join("|");
