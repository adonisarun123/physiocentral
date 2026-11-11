/**
 * Clinic price list (source: clinic's printed price list, Nov 2026).
 * Single session revised from ₹1,100 to ₹800 on 2026-11-11 at the clinic's request.
 * Amounts are in rupees (whole numbers). Edit here; the /pricing page reads only this file.
 */
export type PriceItem = { name: string; amount: number; unit?: string; note?: string; highlight?: boolean };

export const PRICES_UPDATED = "November 2026";

export const CORE_PRICES: PriceItem[] = [
  { name: "Consultation", amount: 400 },
  { name: "Single session", amount: 800, unit: "per session" },
];

export const PACKAGES: PriceItem[] = [
  { name: "7-day package", amount: 5300 },
  { name: "10-day package", amount: 6900, highlight: true },
  { name: "More than 15 days", amount: 650, unit: "per session", note: "No consultation fee" },
  { name: "30-day package", amount: 18000 },
];

export const SPECIALIST_PRICES: PriceItem[] = [
  { name: "Dry needling", amount: 1200, unit: "per session" },
  { name: "Cupping", amount: 1000, unit: "per session" },
  { name: "Deep tissue release (sports massage)", amount: 2000 },
];

export const PACKAGE_INCLUDES = [
  "Free consultation (15 days)",
  "IFT",
  "UST",
  "TENS",
  "IRR",
  "AVT & manual therapy",
  "Back & neck mobilization",
  "KIASTM",
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
