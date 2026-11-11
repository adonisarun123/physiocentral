import { describe, expect, it } from "vitest";
import {
  CONSULTATION, SINGLE_SESSION, LONG_COURSE, PACKAGES, SPECIALIST_PRICES, perSession, rupees,
} from "@/content/pricing";

describe("public price list", () => {
  it("single session is ₹800 (revised from ₹1,100)", () => {
    expect(SINGLE_SESSION.amount).toBe(800);
    expect(CONSULTATION.amount).toBe(400);
  });

  it("every amount is a positive whole rupee", () => {
    for (const p of [CONSULTATION, SINGLE_SESSION, ...PACKAGES, ...SPECIALIST_PRICES]) {
      expect(Number.isInteger(p.amount) && p.amount > 0, p.name).toBe(true);
    }
  });

  it("every package is cheaper per session than single sessions", () => {
    for (const p of PACKAGES.filter((x) => x.sessions)) {
      expect(perSession(p)!, p.name).toBeLessThan(SINGLE_SESSION.amount);
    }
    expect(LONG_COURSE.amount).toBeLessThan(SINGLE_SESSION.amount);
  });

  it("longer packages never cost more per session than shorter ones", () => {
    const rates = PACKAGES.filter((x) => x.sessions).sort((a, b) => a.sessions! - b.sessions!).map((p) => perSession(p)!);
    expect([...rates].sort((a, b) => b - a)).toEqual(rates);
  });

  it("formats rupees Indian-style", () => {
    expect(rupees(18000)).toBe("₹18,000");
    expect(perSession({ name: "x", amount: 5300, sessions: 7 })).toBe(757);
  });
});
