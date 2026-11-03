import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getPublicServices } from "@/modules/content/public";
import { formatINR } from "@/modules/billing/money";
import { PageHero } from "@/components/site/page-hero";
import { iconForCategory } from "@/components/site/icon";
import { MediaPanel } from "@/components/site/media";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Services",
  description: "Physiotherapy services offered by the clinic, with session length and fees or fee policy.",
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const services = await getPublicServices();
  return (
    <>
      <PageHero
        eyebrow="What we do"
        title="Physiotherapy services"
        lead="Your therapist recommends care after assessing you. A listing here doesn't mean a service suits every condition."
      >
        <Link href="/book" className="btn btn-primary">Not sure? Book an assessment</Link>
      </PageHero>
      <div className="wrap section">
        {services.length === 0 ? (
          <div className="card max-w-2xl">
            <p className="title-medium">Service descriptions are being reviewed by the clinic&apos;s clinical lead.</p>
            <p className="body-medium mt-1 text-[var(--color-ink-muted)]">They&apos;ll be published here soon. Please <Link href="/contact">contact the clinic</Link> in the meantime.</p>
          </div>
        ) : (
          <ul className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s, i) => (
              <li key={s.id} data-reveal={String((i % 3) * 80)}>
                <Link href={`/services/${s.slug}`} className="group flex h-full flex-col no-underline">
                  <MediaPanel icon={iconForCategory(s.category)} index={i} className={`aspect-[16/10] rounded-[var(--md-sys-shape-md)]`} />
                  <span className="label-large mt-5 text-[var(--md-sys-color-tertiary)]">{s.category ?? "Physiotherapy"}</span>
                  <span className="headline-small mt-1 text-[var(--color-ink)] group-hover:underline">{s.name}</span>
                  {s.summary ? <span className="body-medium mt-2 line-clamp-3 text-[var(--color-ink-muted)]">{s.summary}</span> : null}
                  <span className="mt-4 flex flex-wrap gap-2">
                    {s.bookable ? <span className="chip">About {s.durationMinutes} min</span> : <span className="chip">Call to book</span>}
                    <span className="chip">{s.pricePaise ? `${formatINR(s.pricePaise)} / ${s.billingUnit.toLowerCase()}` : "Fee after assessment"}</span>
                  </span>
                  <span className="link-arrow mt-5 self-start text-[var(--md-sys-color-primary)]">Learn more <ArrowRight size={16} aria-hidden="true" /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
