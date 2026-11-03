import type { Metadata } from "next";
import Link from "next/link";
import { getPublicBranches, getPublicClinic } from "@/modules/content/public";
import { telHref, displayPhone } from "@/lib/format";
import { PageHero } from "@/components/site/page-hero";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact", description: "Phone, email, address and opening hours.", alternates: { canonical: "/contact" } };

export default async function ContactPage() {
  const [clinic, branches] = await Promise.all([getPublicClinic(), getPublicBranches()]);
  return (
    <>
    <PageHero eyebrow="Contact" title={<>Talk to <em>the clinic</em></>} lead="Call us, or send an appointment request online and we'll confirm a time with you." />
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="card space-y-2">
        {branches.map((b) => (
          <div key={b.id}>
            <h2 className="font-display text-xl font-extrabold tracking-tight">{b.name}</h2>
            {b.phone ? <p>Phone: <a href={telHref(b.phone)}>{displayPhone(b.phone)}</a></p> : <p className="text-[var(--color-ink-muted)]">Phone number will be published soon.</p>}
            <p><Link href={`/locations/${b.slug}`}>Address, hours and directions</Link></p>
          </div>
        ))}
        {clinic?.email ? <p>Email: <a href={`mailto:${clinic.email}`}>{clinic.email}</a></p> : null}
      </div>
      <p className="prose-clinic mt-6">
        To request an appointment, use the <Link href="/book">appointment request form</Link>. Please do not send medical details by email.
        In an emergency, call 112.
      </p>
    </div>
    </>
  );
}
