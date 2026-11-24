import { describe, expect, it } from "vitest";
import { addDays, paiseToRupees, presets, resolveRange, resolveView, toCsv } from "@/modules/reports/range";
import { dayTable, serviceTable, staffTable } from "@/modules/reports/tables";

describe("report ranges", () => {
  const today = "2026-11-24";
  it("defaults to this month up to today", () => {
    expect(resolveRange(undefined, undefined, today)).toEqual({ from: "2026-11-01", to: today });
  });
  it("rejects junk, swaps reversed dates and clamps the future", () => {
    expect(resolveRange("2026-02-30", "nope", today)).toEqual({ from: "2026-11-01", to: today });
    expect(resolveRange("2026-11-20", "2026-11-10", today)).toEqual({ from: "2026-11-10", to: "2026-11-20" });
    expect(resolveRange("2026-11-01", "2027-01-01", today).to).toBe(today);
  });
  it("caps a range at one year", () => {
    const r = resolveRange("2020-01-01", today, today);
    expect(r.from).toBe(addDays(today, -365));
  });
  it("builds presets including last month across a year boundary", () => {
    const p = presets("2026-01-05");
    expect(p.find((x) => x.label === "Last month")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(p.find((x) => x.label === "Yesterday")).toMatchObject({ from: "2026-01-04", to: "2026-01-04" });
  });
  it("only accepts known views", () => {
    expect(resolveView("service")).toBe("service");
    expect(resolveView("profit")).toBe("profit");
    expect(resolveView("drop table")).toBe("day");
  });
});

describe("report output", () => {
  it("formats paise for spreadsheets", () => {
    expect(paiseToRupees("123450")).toBe("1234.50");
    expect(paiseToRupees("-5")).toBe("-0.05");
  });
  it("escapes CSV and blocks formula injection", () => {
    expect(toCsv(["a", "b"], [["=SUM(A1)", 'x, "y"'], ["-12.50", "ok"]])).toBe('a,b\r\n\'=SUM(A1),"x, ""y"""\r\n-12.50,ok\r\n');
  });
  it("totals day rows exactly in paise", () => {
    const row = { completed: 1, no_show: 0, cancelled: 1, new_patients: 1, billed_paise: "60000", credited_paise: "0",
      cash_paise: "50000", upi_paise: "10000", other_paise: "0", collected_paise: "60000", refunded_paise: "10000", net_paise: "50000",
      expenses_paise: "70000", profit_paise: "-20000" };
    const t = dayTable([{ ...row, day: "2026-11-21" }, { ...row, day: "2026-11-20" }], paiseToRupees);
    expect(t.totals).toEqual(["Total", "2", "0", "2", "2", "1200.00", "0.00", "1000.00", "200.00", "0.00", "1200.00", "200.00", "1000.00", "1400.00", "-400.00"]);
  });
  it("returns no totals for an empty period", () => {
    expect(serviceTable([], paiseToRupees).totals).toBeNull();
    expect(staffTable([], paiseToRupees).rows).toEqual([]);
  });
});
