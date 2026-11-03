import type { Metadata } from "next";
import Link from "next/link";
import { Phone, Mail, MapPin, CalendarCheck } from "lucide-react";
import { getOpeningHours, getPublicBranches, getPublicClinic } from "@/modules/content/public";
import { telHref, displayPhone, groupHours } from "@/lib/format";
import { PageHero } from "@/components/site/page-hero";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact", description: "Phone, email, address and opening hours.", alternates: { canonical: "/contact" } };

export default async function ContactPage() {
  const [clinic, branches] = await Promise.all([getPublicClinic(), getPublicBranches()]);
  const b = branches[0];
  const hours = b ? await getOpeningHours(b.id) : [];
  const items = [
    b?.phone ? { icon: Phone, title: "Call", value: displayPhone(b.phone), href: telHref(b.phone)!, tone: "primary" } : null,
    { icon: CalendarCheck, title: "Book online", value: "Request a time in about 2 minutes", href: "/book", tone: "secondary" },
    clinic?.email ? { icon: Mail, title: "Email", value: clinic.email, href: `mailto:${clinic.email}`, tone: "tertiary" } : null,
    b ? { icon: MapPin, title: "Visit", value: "Address, hours & directions", href: `/locations/${b.slug}`, tone: "tertiary" } : null,
  ].filter(Boolean) as { icon: typeof Phone; title: string; value: string; href: string; tone: string }[];
  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to the clinic" lead="Call us, or send an appointment request online and we'll confirm a time with you." />
      <div className="wrap section grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map((it) => (
            <li key={it.title}>
              <a href={it.href} className="card card-hover flex h-full flex-col gap-3 no-underline">
                <span className="grid h-12 w-12 place-items-center rounded-[var(--md-sys-shape-md)]" style={{ background: `var(--md-sys-color-${it.tone}-container)`, color: `var(--md-sys-color-on-${it.tone}-container)` }}><it.icon size={22} aria-hidden="true" /></span>
                <span className="headline-small text-[var(--color-ink)]">{it.title}</span>
                <span className="body-medium text-[var(--color-ink-muted)]">{it.value}</span>
              </a>
            </li>
          ))}
        </ul>
        <aside className="card-filled h-fit">
          <h2 className="headline-small">Opening hours</h2>
          {hours.length ? (
            <dl className="body-medium mt-4 space-y-3">{groupHours(hours).map((g) => <div key={g.days}><dt className="font-semibold">{g.days}</dt><dd className="text-[var(--color-ink-muted)]">{g.hours}</dd></div>)}</dl>
          ) : <p className="body-medium mt-3">Call us for today&apos;s hours.</p>}
          <p className="body-small mt-6 text-[var(--color-ink-muted)]">Please don&apos;t send medical details by email. In an emergency, call 112.</p>
        </aside>
      </div>
      <p className="sr-only"><Link href="/book">Request an appointment</Link></p>
    </>
  );
}
