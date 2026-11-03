import { describe, expect, it } from "vitest";
import { computeBalance, computeLine, divRoundHalfUp, financialYear, formatINR, parseQuantityMilli, parseRupeesToPaise, sumLines } from "@/modules/billing/money";

describe("money arithmetic (§9.4)", () => {
  it("parses quantities and rupees exactly", () => {
    expect(parseQuantityMilli("1")).toBe(1000n);
    expect(parseQuantityMilli("2.5")).toBe(2500n);
    expect(parseQuantityMilli("1.000")).toBe(1000n);
    expect(() => parseQuantityMilli("-1")).toThrow();
    expect(() => parseQuantityMilli("0")).toThrow();
    expect(parseRupeesToPaise("1,200.50")).toBe(120050n);
    expect(() => parseRupeesToPaise("12.345")).toThrow();
  });

  it("rounds half up", () => {
    expect(divRoundHalfUp(5n, 10n)).toBe(1n);
    expect(divRoundHalfUp(4n, 10n)).toBe(0n);
    expect(divRoundHalfUp(15n, 10n)).toBe(2n);
  });

  it("computes the spec's no-tax example: 1000 + 200 = 1200", () => {
    const a = computeLine({ quantityMilli: 1000n, unitPricePaise: 100000n, discountPaise: 0n, taxRateBp: 0, taxInclusive: false });
    const b = computeLine({ quantityMilli: 1000n, unitPricePaise: 20000n, discountPaise: 0n, taxRateBp: 0, taxInclusive: false });
    expect(sumLines([a, b]).totalPaise).toBe(120000n);
  });

  it("exclusive tax on discounted base", () => {
    const r = computeLine({ quantityMilli: 3000n, unitPricePaise: 33333n, discountPaise: 999n, taxRateBp: 1800, taxInclusive: false });
    expect(r.grossPaise).toBe(99999n);
    expect(r.taxablePaise).toBe(99000n);
    expect(r.taxPaise).toBe(17820n);
    expect(r.totalPaise).toBe(116820n);
  });

  it("inclusive tax extraction reconciles to the line total", () => {
    const r = computeLine({ quantityMilli: 1000n, unitPricePaise: 118000n, discountPaise: 0n, taxRateBp: 1800, taxInclusive: true });
    expect(r.taxablePaise).toBe(100000n);
    expect(r.taxPaise).toBe(18000n);
    expect(r.taxablePaise + r.taxPaise).toBe(r.totalPaise);
  });

  it("fractional quantities round once per line", () => {
    const r = computeLine({ quantityMilli: 1333n, unitPricePaise: 101n, discountPaise: 0n, taxRateBp: 0, taxInclusive: false });
    expect(r.grossPaise).toBe(135n); // 134.633 → 135
  });

  it("rejects negative and over-discounted lines (COST-03)", () => {
    expect(() => computeLine({ quantityMilli: 1000n, unitPricePaise: 100n, discountPaise: 101n, taxRateBp: 0, taxInclusive: false })).toThrow();
    expect(() => computeLine({ quantityMilli: 1000n, unitPricePaise: -1n, discountPaise: 0n, taxRateBp: 0, taxInclusive: false })).toThrow();
  });

  it("derives collection status (§10.1)", () => {
    expect(computeBalance(120000n, 0n)).toMatchObject({ amountDuePaise: 120000n, collectionStatus: "UNPAID" });
    expect(computeBalance(120000n, 50000n)).toMatchObject({ amountDuePaise: 70000n, collectionStatus: "PARTIALLY_PAID" });
    expect(computeBalance(120000n, 120000n)).toMatchObject({ amountDuePaise: 0n, collectionStatus: "PAID" });
    expect(computeBalance(100000n, 120000n)).toMatchObject({ amountDuePaise: 0n, excessPaise: 20000n, collectionStatus: "PAID" });
  });

  it("formats INR and financial years", () => {
    expect(formatINR(12345678n)).toBe("₹1,23,456.78");
    expect(financialYear(new Date("2026-03-31T18:00:00Z"))).toBe("2025-26"); // 1 Apr IST already? 23:30 IST on 31 Mar
    expect(financialYear(new Date("2026-03-31T18:31:00Z"))).toBe("2026-27"); // 00:01 IST 1 Apr
  });
});
