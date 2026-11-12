import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Check, Clock, IndianRupee, Phone, Plus, ShieldAlert, ShieldCheck, Users, ClipboardList } from "lucide-react";
import { getPublicBranches, getPublicService, getPublicServices, getServiceTherapists } from "@/modules/content/public";
import { formatINR } from "@/modules/billing/money";
import { JsonLd, breadcrumbJsonLd, isRelatedToProp, relatedLinkProp, siteUrl } from "@/modules/content/schema";
import { linksFor, relatedServiceSlugs } from "@/content/link-map";
import { getPost } from "@/content/blog/posts";
import { iconForCategory } from "@/components/site/icon";
import { MediaPanel, serviceImage } from "@/components/site/media";
import { displayPhone, telHref } from "@/lib/format";
import { pageOpenGraph } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await getPublicService((await params).slug);
  if (!s) return { title: "Service not found", robots: { index: false } };
  return {
    title: s.seoTitle ?? s.name,
    description: s.seoDescription ?? s.summary ?? `${s.name} at the clinic.`,
    alternates: { canonical: `/services/${s.slug}` },
    openGraph: pageOpenGraph(`/services/${s.slug}`, { title: s.seoTitle ?? s.name, description: s.seoDescription ?? s.summary ?? undefined }),
  };
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const s = await getPublicService((await params).slug);
  if (!s) notFound(); // real 404 (SEO-05)
  const [all, branches, providers] = await Promise.all([getPublicServices(), getPublicBranches(), getServiceTherapists(s.id)]);
  const phone = branches[0]?.phone ?? null;
  const path = `/services/${s.slug}`;

  // Editorial links (src/content/link-map.ts), resolved against what is live right now:
  // a related service that has been archived, or a guide that no longer exists, drops out.
  const related = relatedServiceSlugs(s.slug).flatMap((slug) => all.filter((x) => x.slug === slug));
  const resources = linksFor(path).flatMap((l): { href: string; label: string; kind: "guide" | "page" }[] => {
    if (!l.to.startsWith("/blog/")) return l.anchor ? [{ href: l.to, label: l.anchor, kind: "page" }] : [];
    const p = getPost(l.to.slice("/blog/".length));
    return p ? [{ href: l.to, label: p.title, kind: "guide" }] : [];
  });
  // relatedLink mirrors exactly the contextual links rendered below.
  const renderedPaths = [...related.map((r) => `/services/${r.slug}`), ...resources.map((r) => r.href), ...providers.map((t) => `/team/${t.slug}`)];
  const fee = s.pricePaise ? `${formatINR(s.pricePaise)} per ${s.billingUnit.toLowerCase()}` : (s.feePolicyText ?? "Confirmed after assessment");

  // Service + MedicalWebPage markup generated from visible content only (§14.2). No FAQPage rich-result chasing (§14.3).
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MedicalWebPage",
        "@id": siteUrl(`/services/${s.slug}#page`),
        url: siteUrl(`/services/${s.slug}`),
        name: s.seoTitle ?? s.name,
        description: s.seoDescription ?? s.summary,
        about: { "@id": siteUrl(`/services/${s.slug}#service`) },
        ...relatedLinkProp(renderedPaths),
      },
      {
        "@type": "Service",
        "@id": siteUrl(`/services/${s.slug}#service`),
        name: s.name,
        description: s.summary,
        serviceType: "Physiotherapy",
        provider: { "@id": siteUrl("/contact#clinic") },
        areaServed: "HSR Layout, Bengaluru",
        ...isRelatedToProp(related),
      },
    ],
  };

  return (
    <article>
      <JsonLd data={ld} />
      <JsonLd data={breadcrumbJsonLd([{ name: "Services", path: "/services" }, { name: s.name, path: `/services/${s.slug}` }])} />

      {/* Hero: text + curved media with an M3 facts card */}
      <section>
        <div className="wrap grid items-center gap-12 pt-10 pb-20 lg:grid-cols-[1.1fr_0.9fr] lg:pt-14">
          <div data-reveal>
            <nav aria-label="Breadcrumb" className="body-medium mb-6">
              <Link href="/services" className="text-[var(--md-sys-color-primary)]">Services</Link> <span aria-hidden="true" className="mx-1 text-[var(--color-ink-muted)]">/</span> <span aria-current="page" className="text-[var(--color-ink-muted)]">{s.name}</span>
            </nav>
            <p className="eyebrow">{s.category ?? "Physiotherapy"}</p>
            <h1 className="display-medium mt-3">{s.name}</h1>
            {s.headline ? <p className="headline-small mt-4 text-[var(--md-sys-color-primary)]">{s.headline}</p> : null}
            {s.summary ? <p className="body-large mt-4 max-w-2xl text-[var(--color-ink-muted)]">{s.summary}</p> : null}
            <div className="mt-8 flex flex-wrap gap-3">
              {s.bookable ? (
                <Link href={`/book?service=${s.id}`} className="btn btn-primary">Book this service</Link>
              ) : phone ? (
                <a href={telHref(phone)} className="btn btn-primary"><Phone size={18} aria-hidden="true" /> Call to arrange</a>
              ) : null}
              {phone && s.bookable ? <a href={telHref(phone)} className="btn btn-secondary"><Phone size={18} aria-hidden="true" /> {displayPhone(phone)}</a> : null}
            </div>
          </div>
          <div className="relative pb-10" data-reveal="120">
            <MediaPanel icon={iconForCategory(s.category)} index={0} src={serviceImage(s.slug)} priority sizes="(min-width: 1024px) 45vw, 100vw" className="curve-bl aspect-[5/4]" />
            <dl className="absolute right-0 bottom-0 left-8 grid grid-cols-2 gap-4 rounded-[var(--md-sys-shape-md)] bg-[var(--md-sys-color-surface-container-lowest)] p-5 shadow-[var(--md-sys-elevation-2)] sm:left-16">
              <div>
                <dt className="label-medium flex items-center gap-1.5 text-[var(--color-ink-muted)]"><Clock size={16} aria-hidden="true" /> Session</dt>
                <dd className="title-large mt-1">{s.durationMinutes} min</dd>
              </div>
              <div>
                <dt className="label-medium flex items-center gap-1.5 text-[var(--color-ink-muted)]"><Users size={16} aria-hidden="true" /> Format</dt>
                <dd className="title-large mt-1">{s.billingUnit === "Visit" && !s.bookable ? "At your home" : "At the clinic"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="label-medium flex items-center gap-1.5 text-[var(--color-ink-muted)]"><IndianRupee size={16} aria-hidden="true" /> Fee</dt>
                <dd className="body-medium mt-1 font-semibold">{fee}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* Body + conditions */}
      <div className="wrap grid gap-12 pb-20 lg:grid-cols-[1.25fr_0.75fr]">
        <div data-reveal>
          <h2 className="headline-large">About this service</h2>
          {s.body ? <div className="body-large prose-clinic mt-5 space-y-4">{s.body.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}</div> : null}
          {s.whoItMayHelp ? (
            <div className="card-filled mt-8">
              <h3 className="title-large">Who it may help</h3>
              <p className="body-large mt-2 text-[var(--color-ink-muted)]">{s.whoItMayHelp}</p>
            </div>
          ) : null}
          {providers.length ? (
            <p className="body-large mt-6 text-[var(--color-ink-muted)]">
              Sessions are provided by{" "}
              {providers.map((t, i) => (
                <span key={t.slug}>
                  {i > 0 ? (i === providers.length - 1 ? " and " : ", ") : ""}
                  <Link href={`/team/${t.slug}`}>{t.display_name}</Link>, {t.designation.toLowerCase()}
                </span>
              ))}
              .
            </p>
          ) : null}
        </div>
        {s.conditions.length ? (
          <aside className="card h-fit lg:sticky lg:top-32" aria-labelledby="cond-h" data-reveal="100">
            <h2 id="cond-h" className="headline-small flex items-center gap-2"><ClipboardList size={22} className="text-[var(--md-sys-color-primary)]" aria-hidden="true" /> Common reasons people come</h2>
            <ul className="mt-5 space-y-3">
              {s.conditions.map((c) => (
                <li key={c} className="body-medium flex items-start gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"><Check size={14} aria-hidden="true" /></span>
                  {c}
                </li>
              ))}
            </ul>
            <p className="body-small mt-5 text-[var(--color-ink-muted)]">Not listed? Book an assessment and we&apos;ll advise.</p>
          </aside>
        ) : null}
      </div>

      {/* Steps (band) */}
      {s.steps.length ? (
        <section className="band on-band section" aria-labelledby="steps-h">
          <div className="wrap">
            <h2 id="steps-h" className="headline-large" data-reveal>What to expect</h2>
            {s.whatToExpect ? <p className="body-large muted mt-4 max-w-2xl" data-reveal>{s.whatToExpect}</p> : null}
            <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {s.steps.map((st, i) => (
                <li key={st.title} className="border-t border-white/25 pt-6" data-reveal={String(i * 90)}>
                  <span className="font-display block text-[3rem] leading-none" style={{ color: ["#7fb6ff", "#8fd884", "#ffb694", "#7fb6ff"][i % 4] }}>{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="headline-small mt-4">{st.title}</h3>
                  <p className="body-medium muted mt-2">{st.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {/* FAQs + safety */}
      <div className="wrap section grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
        {s.faqs.length ? (
          <section aria-labelledby="faq-h" data-reveal>
            <h2 id="faq-h" className="headline-large">Frequently asked questions</h2>
            <div className="mt-6 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
              {s.faqs.map((f) => (
                <details key={f.q} className="faq">
                  <summary className="state flex min-h-16 items-center justify-between gap-4 rounded-[var(--md-sys-shape-sm)] px-2 py-4">
                    <span className="title-large">{f.q}</span>
                    <span className="faq-icon grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--md-sys-color-primary)]"><Plus size={22} aria-hidden="true" /></span>
                  </summary>
                  <p className="body-large px-2 pb-6 text-[var(--color-ink-muted)]">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ) : <div />}
        {s.limitations ? (
          <aside className="h-fit rounded-[var(--md-sys-shape-md)] bg-[var(--md-sys-color-primary-container)] p-6 text-[var(--md-sys-color-on-primary-container)]" aria-labelledby="safety-h" data-reveal="100">
            <h2 id="safety-h" className="title-large flex items-center gap-2"><ShieldAlert size={22} aria-hidden="true" /> Good to know</h2>
            <p className="body-medium mt-3">{s.limitations}</p>
          </aside>
        ) : null}
      </div>

      {/* CTA */}
      <section className="pb-[clamp(4rem,8vw,7rem)]">
        <div className="wrap">
          <div className="band on-band flex flex-wrap items-center justify-between gap-8 rounded-[var(--md-sys-shape-xl)] p-10 sm:p-14" data-reveal>
            <div>
              <h2 className="headline-large">Ready to get started?</h2>
              <p className="body-large muted mt-2">{s.bookable ? "Request a time online — the clinic confirms it with you." : "Call the clinic to arrange a visit."}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {s.bookable ? <Link href={`/book?service=${s.id}`} className="btn btn-on-band">Book this service</Link> : null}
              {phone ? <a href={telHref(phone)} className="btn btn-ghost-light"><Phone size={18} aria-hidden="true" /> {displayPhone(phone)}</a> : null}
            </div>
          </div>
        </div>
      </section>

      {/* Related services, guides and fees: rendered from the editorial link map */}
      {related.length || resources.length ? (
        <section className="wrap pb-20" aria-labelledby="rel-h">
          <h2 id="rel-h" className="headline-large" data-reveal>{related.length ? "Related services" : "Useful next reads"}</h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-3">
            {related.map((r, i) => (
              <li key={r.id} data-reveal>
                <Link href={`/services/${r.slug}`} className="card card-hover flex h-full flex-col overflow-hidden !p-0 no-underline">
                  <MediaPanel icon={iconForCategory(r.category)} index={i + 1} src={serviceImage(r.slug)} className="aspect-[16/9]" />
                  <span className="flex flex-col gap-2 p-5">
                    <span className="headline-small text-[var(--color-ink)]">{r.name}</span>
                    <span className="body-medium line-clamp-2 text-[var(--color-ink-muted)]">{r.summary}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {resources.length ? (
            <div className="mt-10" data-reveal>
              {related.length ? <h3 className="title-large">Guides and fees</h3> : null}
              <ul className="mt-4 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
                {resources.map((r) => (
                  <li key={r.href}>
                    <Link href={r.href} className="state flex min-h-14 items-center justify-between gap-4 rounded-[var(--md-sys-shape-sm)] px-2 py-3 no-underline">
                      <span>
                        <span className="label-large block text-[var(--md-sys-color-tertiary)]">{r.kind === "guide" ? "Patient guide" : "Pricing"}</span>
                        <span className="title-medium text-[var(--color-ink)]">{r.label}</span>
                      </span>
                      <ArrowRight size={18} className="shrink-0 text-[var(--md-sys-color-primary)]" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="body-small mt-8 flex items-start gap-2 text-[var(--color-ink-muted)]">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            General information about our services, not a diagnosis. Your physiotherapist will advise what&apos;s right for you after assessing you.
          </p>
        </section>
      ) : null}
    </article>
  );
}
