/**
 * Exact money arithmetic (§9.4). INR in integer paise (bigint), quantities in
 * fixed 3-decimal precision (stored as numeric(10,3), handled here as integer
 * thousandths), tax rates in basis points. No floating point anywhere.
 * Rounding: round-half-up to the paisa, applied once per line. Document totals
 * are the sum of rounded line figures, so preview, server and PDF agree.
 *
 * The rounding policy is a DEFAULT pending accountant approval (§24).
 */

export const ROUNDING_POLICY = "line-level round-half-up to 1 paisa; document total = sum of lines";

/** Parse a decimal quantity string ("1", "2.5", "0.125") into thousandths. */
export function parseQuantityMilli(input: string | number): bigint {
  const s = String(input).trim();
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(s)) throw new Error(`invalid quantity: ${s}`);
  const [whole, frac = ""] = s.split(".");
  const milli = BigInt(whole) * 1000n + BigInt(frac.padEnd(3, "0"));
  if (milli <= 0n) throw new Error("quantity must be positive");
  return milli;
}

export function formatQuantity(milli: bigint): string {
  const whole = milli / 1000n;
  const frac = milli % 1000n;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(3, "0").replace(/0+$/, "")}`;
}

/** Parse a rupee amount string ("1200", "1200.50") into paise. */
export function parseRupeesToPaise(input: string): bigint {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) throw new Error(`invalid amount: ${input}`);
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
}

/** Integer division rounding half up, for non-negative operands. */
export function divRoundHalfUp(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error("divisor must be positive");
  if (n < 0n) throw new Error("negative amounts are not used in line math");
  return (n * 2n + d) / (2n * d);
}

/**
 * Parse a percentage ("10", "12.5", "7.25", optional trailing "%") into basis
 * points (1% = 100 bp). Allowed: more than 0, up to 100, at most 2 decimals.
 */
export function parsePercentBp(input: string): number {
  const s = input.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) throw new Error(`invalid percentage: ${input}`);
  const [whole, frac = ""] = s.split(".");
  const bp = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (bp <= 0 || bp > 10000) throw new Error("percentage must be more than 0 and at most 100");
  return bp;
}

/** Display a basis-point rate as a percentage: 1000 → "10%", 1250 → "12.5%". */
export function formatPercentBp(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const frac = String(bp % 100).padStart(2, "0").replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""}%`;
}

/** `bp` basis points of an amount, rounded half up to the paisa. */
export function percentOfPaise(amountPaise: bigint, bp: number): bigint {
  if (!Number.isInteger(bp) || bp < 0 || bp > 10000) throw new Error("bad percentage");
  return divRoundHalfUp(amountPaise * BigInt(bp), 10000n);
}

/** Gross line amount (qty × rate), rounded the same way computeLine does. */
export function lineGrossPaise(quantityMilli: bigint, unitPricePaise: bigint): bigint {
  return divRoundHalfUp(quantityMilli * unitPricePaise, 1000n);
}

/**
 * Split a whole-bill discount across lines in proportion to each line's amount,
 * so per-line tax stays correct. Largest-remainder rounding: the shares add up
 * to exactly `amountPaise`, and no share exceeds its line.
 */
export function allocateDiscount(basesPaise: bigint[], amountPaise: bigint): bigint[] {
  if (amountPaise < 0n) throw new Error("negative discount");
  if (basesPaise.some((b) => b < 0n)) throw new Error("negative line amount");
  const total = basesPaise.reduce((a, b) => a + b, 0n);
  if (amountPaise > total) throw new Error("discount exceeds bill amount");
  if (amountPaise === 0n || total === 0n) return basesPaise.map(() => 0n);
  const shares = basesPaise.map((b) => (b * amountPaise) / total);
  let left = amountPaise - shares.reduce((a, b) => a + b, 0n);
  const order = basesPaise
    .map((b, i) => ({ i, rem: (b * amountPaise) % total }))
    .sort((x, y) => (y.rem > x.rem ? 1 : y.rem < x.rem ? -1 : x.i - y.i));
  for (const { i } of order) {
    if (left === 0n) break;
    if (shares[i] < basesPaise[i]) { shares[i] += 1n; left -= 1n; }
  }
  return shares;
}

export interface LineInput {
  quantityMilli: bigint;
  unitPricePaise: bigint;
  discountPaise: bigint;
  taxRateBp: number;
  taxInclusive: boolean;
}

export interface LineResult {
  grossPaise: bigint;   // qty × rate
  taxablePaise: bigint; // net base excluding tax
  taxPaise: bigint;
  totalPaise: bigint;   // amount payable for the line
}

export function computeLine(l: LineInput): LineResult {
  if (l.unitPricePaise < 0n || l.discountPaise < 0n) throw new Error("negative price or discount");
  if (l.taxRateBp < 0 || l.taxRateBp > 10000 || !Number.isInteger(l.taxRateBp)) throw new Error("bad tax rate");
  const gross = divRoundHalfUp(l.quantityMilli * l.unitPricePaise, 1000n);
  if (l.discountPaise > gross) throw new Error("discount exceeds line amount");
  const net = gross - l.discountPaise;
  const bp = BigInt(l.taxRateBp);
  if (l.taxInclusive) {
    // Extract included tax: taxable = net × 10000 / (10000 + bp)
    const taxable = divRoundHalfUp(net * 10000n, 10000n + bp);
    return { grossPaise: gross, taxablePaise: taxable, taxPaise: net - taxable, totalPaise: net };
  }
  const tax = divRoundHalfUp(net * bp, 10000n);
  return { grossPaise: gross, taxablePaise: net, taxPaise: tax, totalPaise: net + tax };
}

export function sumLines(lines: LineResult[]) {
  return lines.reduce(
    (acc, l) => ({
      subtotalPaise: acc.subtotalPaise + l.taxablePaise,
      taxPaise: acc.taxPaise + l.taxPaise,
      totalPaise: acc.totalPaise + l.totalPaise,
    }),
    { subtotalPaise: 0n, taxPaise: 0n, totalPaise: 0n },
  );
}

/** Balance per §10.2. `netLiability` is the invoice total less its credit notes (invoice_balance.net_liability_paise). */
export function computeBalance(netLiability: bigint, netAllocated: bigint) {
  const due = netLiability - netAllocated;
  return {
    amountDuePaise: due > 0n ? due : 0n,
    excessPaise: due < 0n ? -due : 0n,
    collectionStatus: (netAllocated <= 0n
      ? (netLiability === 0n ? "CLOSED" : "UNPAID")
      : netAllocated >= netLiability
        ? "PAID"
        : "PARTIALLY_PAID") as "UNPAID" | "PARTIALLY_PAID" | "PAID" | "CLOSED",
  };
}

const inrFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Display formatting only. Converts via string, not float math on totals. */
export function formatINR(paise: bigint | number | string): string {
  const p = BigInt(paise);
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const rupees = abs / 100n;
  const rem = (abs % 100n).toString().padStart(2, "0");
  // Group the integer part with en-IN rules; rupees fits safely in Number for display.
  const grouped = inrFmt.format(Number(rupees)).replace(/\.00$/, "");
  return `${neg ? "-" : ""}₹${grouped}.${rem}`;
}

/** Indian financial year label for an instant, evaluated in the clinic timezone. */
export function financialYear(at: Date, timeZone = "Asia/Kolkata"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(at);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
