/**
 * Clinic price list (source: clinic's printed price list, Nov 2026).
 * Single session revised from ₹1,100 to ₹800 on 2026-11-11 at the clinic's request.
 *
 * Interpretations applied to the printed sheet (confirm with the clinic; change here only):
 *  - "N Days Package" = N treatment sessions, one per day.
 *  - "Free Consultation (15 days)" = the ₹400 consultation is waived for package patients
 *    and stays valid for 15 days from the first visit.
 *  - "More than 15 Days ... (No Consultation)" = from the 16th session on, each session is ₹650
 *    and no consultation fee is charged.
 *  - Dry needling, cupping and sports massage are included in packages; the specialist prices
 *    apply only when booked on their own.
 * Amounts are whole rupees. The /pricing page reads only this file.
 */
export type PriceItem = {
  name: string;
  amount: number;
  /** Shown under the amount, e.g. "per session". */
  unit?: string;
  /** Number of sessions a package covers; used to show the per-session rate. */
  sessions?: number;
  note?: string;
};

export const PRICES_UPDATED = "November 2026";
export const CONSULTATION_VALIDITY_DAYS = 15;

export const CONSULTATION: PriceItem = { name: "Consultation", amount: 400, note: "Assessment and treatment plan. Free with any package." };
export const SINGLE_SESSION: PriceItem = { name: "Single session", amount: 800, unit: "per session", note: "Consultation charged separately." };
/** "More than 15 days" rate on the printed sheet. */
export const LONG_COURSE: PriceItem = { name: "16 sessions or more", amount: 650, unit: "per session", note: "No consultation fee." };

export const CORE_PRICES: PriceItem[] = [CONSULTATION, SINGLE_SESSION];

export const PACKAGES: PriceItem[] = [
  { name: "7-day package", amount: 5300, sessions: 7 },
  { name: "10-day package", amount: 6900, sessions: 10 },
  { name: "30-day package", amount: 18000, sessions: 30 },
  LONG_COURSE,
];

export const SPECIALIST_PRICES: PriceItem[] = [
  { name: "Dry needling", amount: 1200, unit: "per session" },
  { name: "Cupping", amount: 1000, unit: "per session" },
  { name: "Deep tissue release (sports massage)", amount: 2000, unit: "per session" },
];

export const PACKAGE_INCLUDES = [
  `Free consultation (valid ${CONSULTATION_VALIDITY_DAYS} days)`,
  "IFT (interferential therapy)",
  "UST (therapeutic ultrasound)",
  "TENS (nerve stimulation)",
  "IRR (infrared radiation)",
  "AVT & manual therapy",
  "Back & neck mobilization",
  "KIASTM (instrument-assisted soft tissue mobilization)",
  "Cupping therapy",
  "Cryotherapy",
  "Moist heat therapy",
  "Dry needling",
  "Sports massage",
  "Posture correction",
  "Strengthening exercises",
  "Personalized home program",
];

export const PACKAGE_BEST_FOR = [
  "Back & neck pain",
  "Knee arthritis",
  "Shoulder pain / frozen shoulder",
  "Sciatica",
  "Sports injuries",
  "Post-surgery rehab",
  "Neurological weakness",
];

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Package price divided by its sessions, rounded to the nearest rupee. */
export const perSession = (p: PriceItem) => (p.sessions ? Math.round(p.amount / p.sessions) : null);
