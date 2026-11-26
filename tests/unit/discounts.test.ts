import { describe, expect, it } from "vitest";
import { allocateDiscount, computeLine, formatPercentBp, lineGrossPaise, parsePercentBp, percentOfPaise } from "@/modules/billing/money";

describe("patient discounts: percentage and amount", () => {
  it("parses percentages to basis points", () => {
    expect(parsePercentBp("10")).toBe(1000);
    expect(parsePercentBp("12.5")).toBe(1250);
    expect(parsePercentBp("7.25%")).toBe(725);
    expect(parsePercentBp("100")).toBe(10000);
    expect(() => parsePercentBp("0")).toThrow();
    expect(() => parsePercentBp("100.01")).toThrow();
    expect(() => parsePercentBp("5.555")).toThrow();
    expect(() => parsePercentBp("-5")).toThrow();
    expect(() => parsePercentBp("ten")).toThrow();
  });

  it("formats percentages without trailing zeros", () => {
    expect(formatPercentBp(1000)).toBe("10%");
    expect(formatPercentBp(1250)).toBe("12.5%");
    expect(formatPercentBp(725)).toBe("7.25%");
    expect(formatPercentBp(5)).toBe("0.05%");
  });

  it("takes a percentage of an amount, rounding half up to the paisa", () => {
    expect(percentOfPaise(100000n, 1000)).toBe(10000n);   // 10% of ₹1,000
    expect(percentOfPaise(33333n, 1000)).toBe(3333n);     // ₹33.333 → ₹33.33
    expect(percentOfPaise(5n, 1000)).toBe(1n);            // 0.5 paisa → 1
    expect(percentOfPaise(80000n, 10000)).toBe(80000n);   // 100%
  });

  it("gross matches computeLine's rounding", () => {
    expect(lineGrossPaise(1333n, 101n)).toBe(computeLine({ quantityMilli: 1333n, unitPricePaise: 101n, discountPaise: 0n, taxRateBp: 0, taxInclusive: false }).grossPaise);
  });

  it("splits a bill discount across lines exactly, proportionally, never above a line", () => {
    const shares = allocateDiscount([100000n, 50000n, 50000n], 10000n);
    expect(shares).toEqual([5000n, 2500n, 2500n]);
    const odd = allocateDiscount([33333n, 33333n, 33334n], 100n);
    expect(odd.reduce((a, b) => a + b, 0n)).toBe(100n);
    const all = allocateDiscount([700n, 300n], 1000n);
    expect(all).toEqual([700n, 300n]);
    const tiny = allocateDiscount([1n, 1n, 1n], 2n);
    expect(tiny.reduce((a, b) => a + b, 0n)).toBe(2n);
    expect(tiny.every((x) => x <= 1n)).toBe(true);
    expect(allocateDiscount([500n, 0n], 0n)).toEqual([0n, 0n]);
    expect(() => allocateDiscount([500n], 501n)).toThrow();
  });
});
