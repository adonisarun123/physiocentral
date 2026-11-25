import { describe, expect, it } from "vitest";
import { amountInWords, numberToIndianWords } from "@/modules/billing/words";

describe("amount in words (Indian system)", () => {
  it("handles small and round amounts", () => {
    expect(amountInWords("0")).toBe("Rupees Zero only");
    expect(amountInWords("40000")).toBe("Rupees Four Hundred only");
    expect(amountInWords("490000")).toBe("Rupees Four Thousand Nine Hundred only");
  });
  it("uses lakh and crore", () => {
    expect(numberToIndianWords(150000n)).toBe("One Lakh Fifty Thousand");
    expect(numberToIndianWords(12_34_56_789n)).toBe("Twelve Crore Thirty-Four Lakh Fifty-Six Thousand Seven Hundred Eighty-Nine");
    expect(numberToIndianWords(1_00_00_000n)).toBe("One Crore");
  });
  it("adds paise when present", () => {
    expect(amountInWords(1234550n)).toBe("Rupees Twelve Thousand Three Hundred Forty-Five and Fifty Paise only");
    expect(amountInWords("101")).toBe("Rupees One and One Paise only");
  });
  it("refuses negatives", () => {
    expect(() => amountInWords(-1n)).toThrow();
  });
});
