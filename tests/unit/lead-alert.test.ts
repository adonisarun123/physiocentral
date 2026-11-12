import { describe, expect, it } from "vitest";
import nodemailer from "nodemailer";
import { buildLeadAlert, leadAlertConfig, type LeadAlertData } from "@/modules/notifications/lead-alert";

const base: LeadAlertData = {
  reference: "PC-ABC123",
  patientName: "Asha Rao",
  phone: "+919876543210",
  email: null,
  isNewPatient: true,
  serviceName: "Physiotherapy assessment",
  therapistName: null,
  startsAt: "2026-11-16T03:00:00.000Z", // 8:30 am IST
  timezone: "Asia/Kolkata",
  clinicName: "Physio Central",
  adminUrl: "https://www.physiocentral.in/admin/requests",
};

describe("lead alert email", () => {
  it("carries the contact details, local time and inbox link", () => {
    const m = buildLeadAlert(base);
    expect(m.subject).toContain("Asha Rao");
    expect(m.text).toContain("Phone: +91 98765 43210");
    expect(m.text).toMatch(/8:30 am IST/);
    expect(m.text).toContain("Preferred physiotherapist: No preference");
    expect(m.text).toContain("https://www.physiocentral.in/admin/requests");
    expect(m.html).toContain('href="tel:+919876543210"');
  });

  it("escapes HTML and keeps the subject on one line", () => {
    const m = buildLeadAlert({ ...base, patientName: 'Eve <script>x</script>\r\nBcc: a@b.c' });
    expect(m.html).not.toContain("<script>");
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it("produces a message nodemailer accepts", async () => {
    const t = nodemailer.createTransport({ jsonTransport: true });
    const info = await t.sendMail({ from: { name: "Physio Central", address: "from@example.com" }, to: ["desk@example.com"], ...buildLeadAlert(base) });
    const sent = JSON.parse(info.message as unknown as string);
    expect(sent.to[0].address).toBe("desk@example.com");
    expect(sent.subject).toContain("New appointment request");
  });

  it("only sends when SMTP and a recipient are configured", () => {
    expect(leadAlertConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(leadAlertConfig({ SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    const c = leadAlertConfig({ SMTP_HOST: "h", SMTP_PORT: "465", SMTP_USER: "u@x.in", SMTP_PASS: "p", LEAD_NOTIFY_EMAIL: "a@x.in, b@x.in" } as unknown as NodeJS.ProcessEnv);
    expect(c).toMatchObject({ secure: true, from: "u@x.in", to: ["a@x.in", "b@x.in"] });
  });
});
