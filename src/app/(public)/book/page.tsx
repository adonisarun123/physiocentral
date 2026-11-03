import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { q } from "@/lib/db";
import { getPublicBranches, getPublicServices } from "@/modules/content/public";
import { BookingForm } from "./booking-form";
import { todayInZone } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Request an appointment",
  robots: { index: false, follow: true }, // functional page: noindex by default (§3.1)
};

export default async function BookPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const [branches, services, sp] = await Promise.all([getPublicBranches(), getPublicServices(), searchParams]);
  const bookable = services.filter((s) => s.bookable);
  const links = await q<{ therapist_id: string; display_name: string; designation: string; service_id: string; branch_id: string }>(
    `SELECT t.id AS therapist_id, t.display_name, t.designation, ts.service_id, tb.branch_id
       FROM therapist t JOIN therapist_skill ts ON ts.therapist_id=t.id JOIN therapist_branch tb ON tb.therapist_id=t.id
      WHERE t.active AND t.public AND t.credentials_verified ORDER BY t.display_name`,
  );
  const serviceBranches = await q<{ service_id: string; branch_id: string }>(`SELECT service_id, branch_id FROM service_branch`);
  const phone = branches[0]?.phone ?? null;

  if (bookable.length === 0 || branches.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <span className="eyebrow">Book appointment</span>
        <h1 className="display mt-4 text-[2.2rem] sm:text-[2.8rem]">Request an <em>appointment</em></h1>
        <p className="prose-clinic mt-4">
          Online requests open once the clinic has published its services. Until then, please {phone ? <>call <a href={`tel:${phone}`}>{phone}</a> or </> : null}
          use the <Link href="/contact">contact page</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <span className="eyebrow">Book appointment</span>
      <h1 className="display mt-4 text-[2.2rem] sm:text-[2.8rem]">Request an <em>appointment</em></h1>
      <p className="prose-clinic mt-3 text-lg text-[var(--color-ink-muted)]">
        Takes about 2 minutes. You don&apos;t need an account. Your request is <strong>pending until the clinic confirms it</strong>.
      </p>
      <BookingForm
        idempotencyKey={randomUUID()}
        today={todayInZone(branches[0].timezone)}
        branches={branches.map((b) => ({ id: b.id, name: b.name, responseWindow: b.responseWindow, timezone: b.timezone }))}
        services={bookable.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes, summary: s.summary, price: s.pricePaise, feePolicy: s.feePolicyText, billingUnit: s.billingUnit }))}
        therapistLinks={links.map((l) => ({ id: l.therapist_id, name: l.display_name, designation: l.designation, serviceId: l.service_id, branchId: l.branch_id }))}
        serviceBranches={serviceBranches.map((x) => ({ serviceId: x.service_id, branchId: x.branch_id }))}
        initialServiceId={sp.service ?? null}
        clinicPhone={phone}
      />
    </div>
  );
}
