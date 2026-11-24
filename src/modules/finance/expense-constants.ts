/** Expense categories and payment methods. Pure (no DB), shared by forms, reports and tests. */
export const EXPENSE_CATEGORIES = [
  ["RENT", "Rent"],
  ["SALARIES", "Salaries & staff payments"],
  ["UTILITIES", "Electricity, water & internet"],
  ["CONSUMABLES", "Consumables (tape, gel, linen…)"],
  ["EQUIPMENT", "Equipment purchase"],
  ["MAINTENANCE", "Repairs & maintenance"],
  ["MARKETING", "Marketing & ads"],
  ["SOFTWARE", "Software & subscriptions"],
  ["PROFESSIONAL_FEES", "Professional fees (CA, legal)"],
  ["TAXES_FEES", "Taxes, licences & bank charges"],
  ["OTHER", "Other"],
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number][0];
export const categoryLabel = (c: string) => EXPENSE_CATEGORIES.find(([k]) => k === c)?.[1] ?? c;

export const PAID_VIA = [
  ["CASH", "Cash"],
  ["UPI", "UPI"],
  ["BANK_TRANSFER", "Bank transfer"],
  ["CARD", "Card"],
  ["CHEQUE", "Cheque"],
  ["OTHER", "Other"],
] as const;
export const paidViaLabel = (c: string) => PAID_VIA.find(([k]) => k === c)?.[1] ?? c;
