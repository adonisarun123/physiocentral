import { describe, expect, it } from "vitest";
import { paiseToRupees } from "@/modules/reports/range";
import { expenseCategoryTable, profitTable } from "@/modules/reports/tables";
import { detectFileType, safeFileName, MAX_DOCUMENT_BYTES } from "@/modules/patients/document-rules";
import { buildReminderEmail, reminderBlock } from "@/modules/billing/reminders";
import { dosageLine } from "@/modules/clinical/exercises";

describe("profit report", () => {
  it("subtracts refunds and expenses from collections, with outstanding shown apart", () => {
    const t = profitTable({ billed_paise: "900000", credited_paise: "5000", collected_paise: "800000", refunded_paise: "20000",
      net_paise: "780000", expenses_paise: "300000", profit_paise: "480000", outstanding_paise: "125000" }, paiseToRupees);
    expect(t.rows).toEqual([
      ["Collected (verified payments)", "8000.00"], ["Less refunds paid back", "-200.00"],
      ["Net collected", "7800.00"], ["Less expenses", "-3000.00"],
    ]);
    expect(t.totals).toEqual(["Profit (net collected − expenses)", "4800.00"]);
    expect(t.notes?.[2]).toEqual(["Still to collect today (all unpaid bills)", "1250.00"]);
  });
  it("labels expense categories and totals them", () => {
    const t = expenseCategoryTable([{ category: "RENT", entries: 1, amount_paise: "2500000" }, { category: "CONSUMABLES", entries: 3, amount_paise: "45050" }], paiseToRupees);
    expect(t.rows[0]).toEqual(["Rent", "1", "25000.00"]);
    expect(t.totals).toEqual(["Total", "4", "25450.50"]);
    expect(expenseCategoryTable([], paiseToRupees).totals).toBeNull();
  });
});

describe("document rules", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0]);
  it("recognises files by their content, not their name", () => {
    expect(detectFileType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("application/pdf");
    expect(detectFileType(bytes(0xff, 0xd8, 0xff))).toBe("image/jpeg");
    expect(detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectFileType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(detectFileType(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectFileType(bytes(0x4d, 0x5a))).toBeNull(); // .exe
  });
  it("cleans file names for download headers and fixes the extension", () => {
    expect(safeFileName('MRI "report"\r\n.exe', "application/pdf")).toBe("MRI-report.pdf");
    expect(safeFileName("../../etc/passwd", "image/png")).toBe("document.png");
    expect(safeFileName("knee x-ray (left).heic", "image/jpeg")).toBe("knee-x-ray-left.jpg");
    expect(safeFileName("", "image/jpeg")).toBe("document.jpg");
  });
  it("keeps the limit under Vercel's request size", () => {
    expect(MAX_DOCUMENT_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
});

describe("payment reminders", () => {
  const base = { email: "a@b.in", credit_paise: "0", opted_out: false, last_reminder_at: null, last_reminder_status: null };
  it("only sends when it is appropriate", () => {
    expect(reminderBlock(base)).toBeNull();
    expect(reminderBlock({ ...base, email: null })).toMatch(/No email/);
    expect(reminderBlock({ ...base, opted_out: true })).toMatch(/opted out/);
    expect(reminderBlock({ ...base, credit_paise: "100" })).toMatch(/credit/);
    const now = new Date("2026-11-24T10:00:00Z");
    expect(reminderBlock({ ...base, last_reminder_at: new Date("2026-11-23T10:00:00Z"), last_reminder_status: "SENT" } as never, now)).toMatch(/3 days/);
    expect(reminderBlock({ ...base, last_reminder_at: new Date("2026-11-23T10:00:00Z"), last_reminder_status: "FAILED" } as never, now)).toBeNull();
    expect(reminderBlock({ ...base, last_reminder_at: new Date("2026-11-20T09:00:00Z"), last_reminder_status: "SENT" } as never, now)).toBeNull();
  });
  it("lists bills and amounts, escapes names, and keeps headers single-line", () => {
    const m = buildReminderEmail({ clinicName: "Physio Central", clinicPhone: "+919845000000", patientName: "<b>Ravi</b>\r\nBcc: x@y.z",
      bills: [{ number: "INV/25-26/0007", issuedAt: new Date("2026-11-01T06:00:00Z"), duePaise: "150000" }], totalPaise: "150000" });
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.subject).toContain("1,500.00");
    expect(m.html).toContain("&lt;b&gt;Ravi&lt;/b&gt;");
    expect(m.text).toContain("INV/25-26/0007");
  });
});

describe("exercise dosage", () => {
  it("reads naturally", () => {
    expect(dosageLine({ sets: 3, reps: 10, hold_seconds: 5, times_per_day: 2, days_per_week: 7 })).toBe("3 sets × 10 reps · hold 5 s · 2 times a day · every day");
    expect(dosageLine({ sets: 1, reps: null, hold_seconds: null, times_per_day: 1, days_per_week: 5 })).toBe("1 set · once a day · 5 days a week");
    expect(dosageLine({ sets: null, reps: null, hold_seconds: null, times_per_day: null, days_per_week: null })).toBe("");
  });
});
