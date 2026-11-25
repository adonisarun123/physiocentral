/**
 * Indian-system amount in words for printed bills and receipts:
 * 490000 paise → "Rupees Four Thousand Nine Hundred only";
 * 1234550 paise → "Rupees Twelve Thousand Three Hundred Forty-Five and Fifty Paise only".
 * Works on integer paise (bigint or decimal string), never floats (§9.4).
 */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function upTo99(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

function upTo999(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? upTo99(r) : ""].filter(Boolean).join(" ");
}

/** Whole number in the Indian system (thousand, lakh, crore). */
export function numberToIndianWords(value: bigint): string {
  if (value < 0n) throw new Error("negative amount");
  if (value === 0n) return "Zero";
  const parts: string[] = [];
  const crore = value / 10_000_000n;
  let rest = Number(value % 10_000_000n);
  if (crore > 0n) parts.push(`${numberToIndianWords(crore)} Crore`);
  const lakh = Math.floor(rest / 100_000); rest %= 100_000;
  const thousand = Math.floor(rest / 1000); rest %= 1000;
  if (lakh) parts.push(`${upTo99(lakh)} Lakh`);
  if (thousand) parts.push(`${upTo99(thousand)} Thousand`);
  if (rest) parts.push(upTo999(rest));
  return parts.join(" ");
}

export function amountInWords(paise: bigint | string): string {
  const p = typeof paise === "bigint" ? paise : BigInt(paise);
  if (p < 0n) throw new Error("negative amount");
  const rupees = p / 100n, rem = Number(p % 100n);
  return `Rupees ${numberToIndianWords(rupees)}${rem ? ` and ${upTo99(rem)} Paise` : ""} only`;
}
