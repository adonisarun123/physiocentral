import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { Icon } from "@/components/site/icon";
import { CONDITION_GROUPS } from "@/content/conditions";
import { getPublicServices } from "@/modules/content/public";
import { getPost } from "@/content/blog/posts";
import { JsonLd, breadcrumbJsonLd, siteUrl } from "@/modules/content/schema";
import { pageOpenGraph } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Conditions we treat — physiotherapy in HSR Layout",
  description: "Back pain, sciatica, neck pain, frozen shoulder, knee arthritis, sports injuries, heel pain and rehab after surgery: conditions treated at Physio Central, HSR Layout, Bengaluru.",
  alternates: { canonical: "/conditions" },
  openGraph: pageOpenGraph("/conditions"),
};

export default async function ConditionsPage() {
  const services = await getPublicServices();
  const live = new Map(services.map((s) => [s.slug, s.name]));
  const groups = CONDITION_GROUPS.map((g) => ({ ...g, conditions: g.conditions.filter((c) => live.has(c.service)) })).filter((g) => g.conditions.length);
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": siteUrl("/conditions#page"),
        url: siteUrl("/conditions"),
        name: "Conditions we treat",
        about: { "@id": siteUrl("/contact#clinic") },
      },
      breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Conditions we treat", path: "/conditions" }]),
    ],
  };

  return (
    <>
      <JsonLd data={ld} />
      <PageHero
        eyebrow="Conditions we treat"
        title="What we help with"
        lead="The problems people most often bring to our HSR Layout clinic, grouped by body area. Not sure where yours fits? Book an assessment and we'll work it out together."
      >
        <Link href="/book" className="btn btn-primary">Request appointment</Link>
        <Link href="/services" className="btn btn-secondary">All services</Link>
      </PageHero>

      <nav aria-label="Body areas" className="wrap pt-10">
        <ul className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <li key={g.key}><a href={`#${g.key}`} className="btn btn-tonal">{g.title}</a></li>
          ))}
        </ul>
      </nav>

      <div className="wrap section space-y-20">
        {groups.map((g, gi) => {
          const tone = ["secondary", "tertiary", "primary"][gi % 3];
          return (
            <section key={g.key} id={g.key} aria-labelledby={`${g.key}-h`} className="scroll-mt-28">
              <div className="flex items-center gap-4" data-reveal>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--md-sys-shape-md)]" style={{ background: `var(--md-sys-color-${tone}-container)`, color: `var(--md-sys-color-on-${tone}-container)` }}>
                  <Icon name={g.icon} size={22} aria-hidden="true" />
                </span>
                <h2 id={`${g.key}-h`} className="headline-large">{g.title}</h2>
              </div>
              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {g.conditions.map((c, i) => {
                  const guide = c.guide ? getPost(c.guide) : null;
                  return (
                    <li key={c.name} className="card flex h-full flex-col" data-reveal={String((i % 3) * 60)}>
                      <h3 className="title-large">{c.name}</h3>
                      <p className="body-medium mt-2 flex-1 text-[var(--color-ink-muted)]">{c.summary}</p>
                      <div className="mt-5 flex flex-col gap-2">
                        <Link href={`/services/${c.service}`} className="link-arrow text-[var(--md-sys-color-primary)]">{live.get(c.service)} <ArrowRight size={16} aria-hidden="true" /></Link>
                        {guide ? <Link href={`/blog/${guide.slug}`} className="body-small text-[var(--color-ink-muted)]">Read the guide: {guide.title}</Link> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <section className="card-filled" aria-labelledby="unsure-h">
          <h2 id="unsure-h" className="headline-small">Not on the list?</h2>
          <p className="body-large mt-3 max-w-2xl text-[var(--color-ink-muted)]">
            This isn&apos;t everything we treat. Start with an <Link href="/services/initial-physiotherapy-assessment">initial assessment</Link>: we&apos;ll examine the problem, explain it in plain language and tell you honestly whether physiotherapy is the right next step, or whether you need a doctor&apos;s opinion first.
          </p>
          <p className="body-small mt-4 text-[var(--color-ink-muted)]">General information, not a diagnosis. In an emergency, call 112.</p>
        </section>
      </div>
    </>
  );
}
