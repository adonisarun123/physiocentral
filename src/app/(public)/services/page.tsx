import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CalendarCheck, Phone } from "lucide-react";
import { getPublicBranches, getPublicClinic, getPublicServices } from "@/modules/content/public";
import { formatINR } from "@/modules/billing/money";
import { displayPhone, telHref } from "@/lib/format";
import { PageHero } from "@/components/site/page-hero";
import { Icon, iconForCategory } from "@/components/site/icon";
import { pageOpenGraph } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Services",
  description: "Physiotherapy services offered by the clinic, with session length and fees or fee policy.",
  alternates: { canonical: "/services" },
  openGraph: pageOpenGraph("/services"),
};

export default async function ServicesPage() {
  const [services, clinic, branches] = await Promise.all([getPublicServices(), getPublicClinic(), getPublicBranches()]);
  const phone = branches[0]?.phone ?? clinic?.phone ?? null;
  const tel = phone ? telHref(phone) : null;
  const homeVisits = services.some((s) => /home/i.test(s.slug));
  return (
    <>
      <PageHero
        tone="band"
        eyebrow="Services"
        title="Physiotherapy services"
        lead="Your therapist recommends care after assessing you. A listing here doesn't mean a service suits every condition."
      >
        <Link href="/book" className="btn btn-on-band"><CalendarCheck size={18} aria-hidden="true" /> Book an assessment</Link>
        {tel && phone ? <a href={tel} className="btn btn-ghost-light"><Phone size={18} aria-hidden="true" /> Call {displayPhone(phone)}</a> : null}
      </PageHero>
      <div className="wrap section">
        {services.length === 0 ? (
          <div className="card max-w-2xl">
            <p className="title-medium">Service descriptions are being reviewed by the clinic&apos;s clinical lead.</p>
            <p className="body-medium mt-1 text-[var(--color-ink-muted)]">They&apos;ll be published here soon. Please <Link href="/contact">contact the clinic</Link> in the meantime.</p>
          </div>
        ) : (
          <section aria-labelledby="svc-h">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-line)] pb-5" data-reveal>
              <div>
                <h2 id="svc-h" className="headline-large">Care we provide</h2>
                <p className="body-medium mt-2 text-[var(--color-ink-muted)]">Every plan starts with an assessment. Choose a service to see what a session involves.</p>
              </div>
              <span className="count-pill">{services.length} {services.length === 1 ? "service" : "services"}</span>
            </div>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s, i) => (
                <li key={s.id} data-reveal={String((i % 3) * 80)}>
                  <Link href={`/services/${s.slug}`} className="svc-card">
                    <span className="flex items-center gap-3">
                      <span className="svc-icon"><Icon name={iconForCategory(s.category)} size={22} strokeWidth={1.7} /></span>
                      <span className="label-large text-[var(--md-sys-color-tertiary)]">{s.category ?? "Physiotherapy"}</span>
                    </span>
                    <span className="headline-small mt-4 text-[var(--color-ink)]">{s.name}</span>
                    {s.summary ? <span className="body-medium mt-2 line-clamp-3 text-[var(--color-ink-muted)]">{s.summary}</span> : null}
                    <span className="mt-4 flex flex-wrap gap-2">
                      {s.bookable ? <span className="chip">About {s.durationMinutes} min</span> : <span className="chip">Call to book</span>}
                      <span className="chip">{s.pricePaise ? `${formatINR(s.pricePaise)} / ${s.billingUnit.toLowerCase()}` : "Fee after assessment"}</span>
                    </span>
                    <span className="svc-more mt-auto pt-5">Learn more <ArrowRight size={16} aria-hidden="true" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="svc-cta-h" className="cta-card mt-16 sm:mt-20" data-reveal>
          <p className="eyebrow">Ready when you are</p>
          <h2 id="svc-cta-h" className="headline-large mt-2">Book your appointment</h2>
          <p className="body-large mt-3 max-w-2xl text-[var(--color-ink-muted)]">
            Start with an assessment at the clinic and your therapist will plan the next steps with you.
            {homeVisits ? " If travelling is difficult, call us about a home visit." : ""}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/book" className="btn btn-primary"><CalendarCheck size={18} aria-hidden="true" /> Book appointment</Link>
            {tel && phone ? <a href={tel} className="btn btn-dark"><Phone size={18} aria-hidden="true" /> Call {displayPhone(phone)}</a> : null}
            <Link href="/pricing" className="btn btn-secondary">See pricing</Link>
          </div>
        </section>
      </div>
    </>
  );
}
