import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, House, MapPin } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { AREAS } from "@/content/areas";
import { JsonLd, breadcrumbJsonLd, siteUrl } from "@/modules/content/schema";
import { pageOpenGraph } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Physiotherapy near you: areas we serve in south-east Bengaluru",
  description: "Physio Central's clinic is in HSR Layout, Bengaluru, with home visits in Sarjapur Road, Electronic City, Koramangala, Bellandur, BTM Layout and Bommanahalli.",
  alternates: { canonical: "/physiotherapy" },
  openGraph: pageOpenGraph("/physiotherapy"),
};

export default function AreasHub() {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": siteUrl("/physiotherapy#page"), url: siteUrl("/physiotherapy"), name: "Areas we serve", about: { "@id": siteUrl("/contact#clinic") } },
      breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Areas we serve", path: "/physiotherapy" }]),
    ],
  };
  return (
    <>
      <JsonLd data={ld} />
      <PageHero eyebrow="Areas we serve" title="Physiotherapy near you" lead="We have one clinic, in Sector 2, HSR Layout. Patients come to us from across south-east Bengaluru, and we offer home visits in the areas below." />
      <div className="wrap section">
        <Link href="/physiotherapy-hsr-layout" className="card card-hover flex items-center gap-5 no-underline" data-reveal>
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--md-sys-shape-md)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"><MapPin size={26} aria-hidden="true" /></span>
          <span className="flex-1">
            <span className="headline-small block text-[var(--color-ink)]">HSR Layout</span>
            <span className="body-medium text-[var(--color-ink-muted)]">Our clinic: 24th Main Road, Garden Layout, Sector 2</span>
          </span>
          <ArrowRight size={20} aria-hidden="true" className="text-[var(--md-sys-color-primary)]" />
        </Link>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {AREAS.map((a, i) => (
            <li key={a.slug} data-reveal={String((i % 3) * 60)}>
              <Link href={`/physiotherapy/${a.slug}`} className="card card-hover flex h-full flex-col no-underline">
                <span className="title-large text-[var(--color-ink)]">{a.name}</span>
                <span className="body-medium mt-2 flex-1 text-[var(--color-ink-muted)]">{a.neighbourhoods.slice(0, 4).join(" · ")}</span>
                {a.homeVisits ? <span className="label-large mt-4 inline-flex items-center gap-2 text-[var(--md-sys-color-tertiary)]"><House size={16} aria-hidden="true" /> Home visits available</span> : null}
              </Link>
            </li>
          ))}
        </ul>
        <p className="body-medium mt-10 max-w-2xl text-[var(--color-ink-muted)]">Live somewhere else nearby? <Link href="/contact">Call the clinic</Link> and we&apos;ll tell you whether a home visit is possible.</p>
      </div>
    </>
  );
}
