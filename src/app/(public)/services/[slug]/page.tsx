import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Check, Clock, IndianRupee, Phone, Plus, ShieldAlert, ShieldCheck, Users, ClipboardList } from "lucide-react";
import { getPublicBranches, getPublicService, getPublicServices } from "@/modules/content/public";
import { formatINR } from "@/modules/billing/money";
import { JsonLd, breadcrumbJsonLd, siteUrl } from "@/modules/content/schema";
import { Icon, iconForCategory } from "@/components/site/icon";
import { displayPhone, telHref } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await getPublicService((await params).slug);
  if (!s) return { title: "Service not found", robots: { index: false } };
  return {
    title: s.seoTitle ?? s.name,
    description: s.seoDescription ?? s.summary ?? `${s.name} at the clinic.`,
    alternates: { canonical: `/services/${s.slug}` },
    openGraph: { title: s.seoTitle ?? s.name, description: s.seoDescription ?? s.summary ?? undefined, url: `/services/${s.slug}` },
  };
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const s = await getPublicService((await params).slug);
  if (!s) notFound(); // real 404 (SEO-05)
  const [all, branches] = await Promise.all([getPublicServices(), getPublicBranches()]);
  const phone = branches[0]?.phone ?? null;
  const related = all.filter((x) => x.id !== s.id).slice(0, 3);
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
      },
      {
        "@type": "Service",
        "@id": siteUrl(`/services/${s.slug}#service`),
        name: s.name,
        description: s.summary,
        serviceType: "Physiotherapy",
        provider: { "@id": siteUrl("/locations/main#clinic") },
        areaServed: "HSR Layout, Bengaluru",
      },
    ],
  };

  return (
    <article>
      <JsonLd data={ld} />
      <JsonLd data={breadcrumbJsonLd([{ name: "Services", path: "/services" }, { name: s.name, path: `/services/${s.slug}` }])} />

      {/* Hero */}
      <section className="aurora grid-dots border-b border-[var(--color-line)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
          <div data-reveal>
            <nav aria-label="Breadcrumb" className="mb-5 text-sm">
              <Link href="/services">Services</Link> <span aria-hidden="true" className="mx-1 text-[var(--color-ink-muted)]">/</span> <span aria-current="page" className="text-[var(--color-ink-muted)]">{s.name}</span>
            </nav>
            <span className="eyebrow"><Icon name={iconForCategory(s.category)} size={15} /> {s.category ?? "Physiotherapy"}</span>
            <h1 className="display mt-5 text-[2.5rem] sm:text-[3.8rem]">{s.name}</h1>
            {s.headline ? <p className="font-display mt-4 text-xl font-bold text-[var(--color-brand)] sm:text-2xl">{s.headline}</p> : null}
            {s.summary ? <p className="mt-4 max-w-2xl text-lg text-[var(--color-ink-muted)]">{s.summary}</p> : null}
            <div className="mt-8 flex flex-wrap gap-3">
              {s.bookable ? (
                <Link href={`/book?service=${s.id}`} className="btn btn-primary px-6 py-3 text-base">Book this service <ArrowRight size={18} aria-hidden="true" /></Link>
              ) : phone ? (
                <a href={telHref(phone)} className="btn btn-primary px-6 py-3 text-base"><Phone size={18} aria-hidden="true" /> Call to arrange</a>
              ) : null}
              {phone && s.bookable ? <a href={telHref(phone)} className="btn btn-secondary px-6 py-3 text-base"><Phone size={18} aria-hidden="true" /> {displayPhone(phone)}</a> : null}
            </div>
          </div>
          <dl className="glass grid grid-cols-2 gap-4 rounded-3xl p-6" data-reveal="120">
            <div>
              <dt className="flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)]"><Clock size={16} aria-hidden="true" /> Session</dt>
              <dd className="font-display mt-1 text-lg font-extrabold">{s.durationMinutes} min</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)]"><Users size={16} aria-hidden="true" /> Format</dt>
              <dd className="font-display mt-1 text-lg font-extrabold">{s.billingUnit === "Visit" && !s.bookable ? "At your home" : "At the clinic"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)]"><IndianRupee size={16} aria-hidden="true" /> Fee</dt>
              <dd className="mt-1 font-semibold">{fee}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Body + conditions */}
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div data-reveal>
          <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">About this service</h2>
          {s.body ? <div className="prose-clinic mt-4 space-y-4 text-lg leading-relaxed">{s.body.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}</div> : null}
          {s.whoItMayHelp ? (
            <div className="mt-8 rounded-2xl bg-[var(--color-surface-alt)] p-6">
              <h3 className="font-display text-lg font-extrabold">Who it may help</h3>
              <p className="mt-2 text-[var(--color-ink-muted)]">{s.whoItMayHelp}</p>
            </div>
          ) : null}
        </div>
        {s.conditions.length ? (
          <aside className="card h-fit lg:sticky lg:top-28" aria-labelledby="cond-h" data-reveal="100">
            <h2 id="cond-h" className="font-display flex items-center gap-2 text-xl font-extrabold"><ClipboardList size={20} className="text-[var(--color-brand)]" aria-hidden="true" /> Common reasons people come</h2>
            <ul className="mt-4 space-y-2.5">
              {s.conditions.map((c) => (
                <li key={c} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--color-green-soft)] text-[var(--color-green)]"><Check size={13} aria-hidden="true" /></span>
                  {c}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-[var(--color-ink-muted)]">Not listed? Book an assessment and we&apos;ll advise.</p>
          </aside>
        ) : null}
      </div>

      {/* Steps */}
      {s.steps.length ? (
        <section className="bg-[var(--color-surface-alt)]" aria-labelledby="steps-h">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
            <span className="eyebrow" data-reveal>How it works</span>
            <h2 id="steps-h" className="display mt-5 text-[2rem] sm:text-[2.6rem]" data-reveal>What to <em>expect</em></h2>
            {s.whatToExpect ? <p className="mt-4 max-w-2xl text-lg text-[var(--color-ink-muted)]" data-reveal>{s.whatToExpect}</p> : null}
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {s.steps.map((st, i) => (
                <li key={st.title} className="card relative overflow-hidden" data-reveal={String(i * 90)}>
                  <span className={`font-display absolute -right-2 -top-4 text-7xl font-extrabold opacity-10 ${["text-[var(--color-logo-blue)]", "text-[var(--color-logo-green)]", "text-[var(--color-logo-orange)]", "text-[var(--color-logo-blue)]"][i % 4]}`} aria-hidden="true">{i + 1}</span>
                  <p className="text-sm font-bold uppercase tracking-widest text-[var(--color-ink-muted)]">Step {i + 1}</p>
                  <h3 className="font-display mt-1 text-lg font-extrabold">{st.title}</h3>
                  <p className="mt-2 text-[var(--color-ink-muted)]">{st.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {/* FAQs + safety */}
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
        {s.faqs.length ? (
          <section aria-labelledby="faq-h" data-reveal>
            <h2 id="faq-h" className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Frequently asked questions</h2>
            <div className="mt-6 space-y-3">
              {s.faqs.map((f) => (
                <details key={f.q} className="faq card !p-0">
                  <summary className="flex items-center justify-between gap-4 px-6 py-5">
                    <span className="font-display text-lg font-bold">{f.q}</span>
                    <span className="faq-icon grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-brand-soft)] text-[var(--color-brand)]"><Plus size={18} aria-hidden="true" /></span>
                  </summary>
                  <p className="px-6 pb-6 text-[var(--color-ink-muted)]">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ) : <div />}
        {s.limitations ? (
          <aside className="h-fit rounded-2xl border border-[#f3c9a8] bg-[var(--color-orange-soft)] p-6" aria-labelledby="safety-h" data-reveal="100">
            <h2 id="safety-h" className="font-display flex items-center gap-2 text-lg font-extrabold text-[var(--color-orange)]"><ShieldAlert size={20} aria-hidden="true" /> Good to know</h2>
            <p className="mt-3 text-[var(--color-ink)]">{s.limitations}</p>
          </aside>
        ) : null}
      </div>

      {/* CTA */}
      <section className="px-4 pb-16 sm:px-6">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[var(--color-ink)] px-6 py-12 text-white sm:px-12" data-reveal>
          <div className="glow-orange -right-16 -top-24" aria-hidden="true" />
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Ready to get started?</h2>
              <p className="mt-2 text-white/80">{s.bookable ? "Request a time online — the clinic confirms it with you." : "Call the clinic to arrange a visit."}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {s.bookable ? <Link href={`/book?service=${s.id}`} className="btn btn-primary">Book this service <ArrowRight size={16} aria-hidden="true" /></Link> : null}
              {phone ? <a href={telHref(phone)} className="btn btn-ghost-light"><Phone size={16} aria-hidden="true" /> {displayPhone(phone)}</a> : null}
            </div>
          </div>
        </div>
      </section>

      {/* Related */}
      {related.length ? (
        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6" aria-labelledby="rel-h">
          <h2 id="rel-h" className="font-display text-2xl font-extrabold tracking-tight" data-reveal>Related services</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {related.map((r) => (
              <li key={r.id} data-reveal>
                <Link href={`/services/${r.slug}`} className="card card-hover flex h-full flex-col gap-2 no-underline">
                  <span className="font-display text-lg font-extrabold text-[var(--color-ink)]">{r.name}</span>
                  <span className="text-sm text-[var(--color-ink-muted)]">{r.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-8 flex items-start gap-2 text-sm text-[var(--color-ink-muted)]">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            General information about our services, not a diagnosis. Your physiotherapist will advise what&apos;s right for you after assessing you.
          </p>
        </section>
      ) : null}
    </article>
  );
}
