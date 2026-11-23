import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, Clock, House, MapPin, Navigation, Phone, Plus, Stethoscope, UserRound } from "lucide-react";
import { getOpeningHours, getPublicBranches, getPublicClinic, getPublicServices } from "@/modules/content/public";
import { JsonLd, breadcrumbJsonLd, siteUrl } from "@/modules/content/schema";
import { telHref, displayPhone, groupHours } from "@/lib/format";
import { PageHero } from "@/components/site/page-hero";
import { ORTHO } from "@/components/site/ortho-referral";
import { AREAS, getArea } from "@/content/areas";
import { pageOpenGraph } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const dynamicParams = false;

export function generateStaticParams() {
  return AREAS.map((a) => ({ area: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const { area } = await params;
  const a = getArea(area);
  if (!a) return { title: "Area not found", robots: { index: false } };
  const path = `/physiotherapy/${a.slug}`;
  return { title: a.title, description: a.metaDescription, alternates: { canonical: path }, openGraph: pageOpenGraph(path, { title: `${a.title} | Physio Central`, description: a.metaDescription }) };
}

export default async function AreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  const a = getArea(area);
  if (!a) notFound();
  const path = `/physiotherapy/${a.slug}`;
  const [clinic, branches, services] = await Promise.all([getPublicClinic(), getPublicBranches(), getPublicServices()]);
  const b = branches[0];
  const hours = b ? await getOpeningHours(b.id) : [];
  const phone = b?.phone ?? clinic?.phone ?? null;
  const address = b?.addressVerified ? [b.addressLine, b.locality, b.city, b.region, b.postalCode].filter(Boolean).join(", ") : null;
  const directionsUrl = address ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a.origin)}&destination=${encodeURIComponent(address)}` : b?.mapUrl ?? null;
  const sessionMins = services.find((s) => s.bookable && !/assess/i.test(s.slug))?.durationMinutes ?? 45;
  const others = AREAS.filter((x) => x.slug !== a.slug);
  const faqs = [
    ...a.faqs,
    { q: "What are the clinic's opening hours?", a: hours.length ? groupHours(hours).map((g) => `${g.days}: ${g.hours}`).join(". ") + "." : "Please call the clinic for today's hours." },
  ];

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": siteUrl(`${path}#page`),
        url: siteUrl(path),
        name: a.title,
        about: { "@id": siteUrl("/contact#clinic") },
        ...(a.homeVisits ? { mentions: { "@type": "Service", "@id": siteUrl("/services/home-visits#service"), name: "Home Visits", areaServed: { "@type": "Place", name: `${a.name}, Bengaluru` } } } : {}),
      },
      breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Areas we serve", path: "/physiotherapy" }, { name: a.name, path }]),
    ],
  };

  return (
    <>
      <JsonLd data={ld} />
      <PageHero eyebrow={`${a.name} · Bengaluru`} title={a.title} lead={a.intro} tone="band">
        <Link href="/book" className="btn btn-on-band">Request appointment</Link>
        {phone ? <a href={telHref(phone)} className="btn btn-secondary"><Phone size={18} aria-hidden="true" /> {a.homeVisits ? "Call about a home visit" : displayPhone(phone)}</a> : null}
      </PageHero>

      {/* Honest location statement */}
      <section className="wrap pt-12" aria-label="Where we are">
        <div className="card-filled flex items-start gap-4">
          <MapPin size={22} aria-hidden="true" className="mt-1 shrink-0 text-[var(--md-sys-color-primary)]" />
          <p className="body-large">
            <strong>Our clinic is in HSR Layout, not in {a.name}.</strong> {address ? `It's at ${address}.` : ""}{a.homeVisits ? ` We also offer home visits in ${a.name}.` : ""}
          </p>
        </div>
      </section>

      {/* What people come in with */}
      <section className="wrap section" aria-labelledby="common-h">
        <p className="eyebrow">Common reasons to visit</p>
        <h2 id="common-h" className="headline-large mt-2 max-w-3xl">What people from {a.name} often see us for</h2>
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {a.commonProblems.map((p, i) => (
            <li key={p.label} className="card flex h-full flex-col" data-reveal={String(i * 60)}>
              <h3 className="title-large">{p.label}</h3>
              <p className="body-medium mt-2 flex-1 text-[var(--color-ink-muted)]">{p.detail}</p>
              <Link href={p.href} className="link-arrow mt-4 text-[var(--md-sys-color-primary)]">Read more <ArrowRight size={16} aria-hidden="true" /></Link>
            </li>
          ))}
        </ul>
        <p className="body-medium mt-6"><Link href="/conditions">See all the conditions we treat</Link></p>
      </section>

      {/* Home visits + getting here */}
      <section className="bg-[var(--md-sys-color-surface-container-low)]" aria-label="Ways to get care">
        <div className="wrap section grid gap-10 lg:grid-cols-2">
          {a.homeVisits ? (
            <div data-reveal>
              <House size={26} aria-hidden="true" className="text-[var(--md-sys-color-primary)]" />
              <h2 className="headline-large mt-3">Home visits in {a.name}</h2>
              <p className="body-large mt-4 text-[var(--color-ink-muted)]">{a.homeVisitNote}</p>
              <p className="body-medium mt-3 text-[var(--color-ink-muted)]">Nearby neighbourhoods: {a.neighbourhoods.join(", ")}. Not sure we reach you? Call and we&apos;ll confirm.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {phone ? <a href={telHref(phone)} className="btn btn-primary"><Phone size={18} aria-hidden="true" /> {displayPhone(phone)}</a> : null}
                <Link href="/services/home-visits" className="btn btn-secondary">About home visits</Link>
              </div>
            </div>
          ) : null}
          <div data-reveal="80">
            <Navigation size={26} aria-hidden="true" className="text-[var(--md-sys-color-primary)]" />
            <h2 className="headline-large mt-3">Coming to the clinic from {a.name}</h2>
            <ul className="body-large mt-4 list-disc space-y-2 pl-5 text-[var(--color-ink-muted)]">
              {a.gettingHere.map((g) => <li key={g}>{g}</li>)}
            </ul>
            <p className="body-medium mt-4 flex gap-2 text-[var(--color-ink-muted)]"><Clock size={18} aria-hidden="true" className="mt-0.5 shrink-0" /> {a.timing}</p>
            {directionsUrl ? <a href={directionsUrl} target="_blank" rel="noopener" className="btn btn-tonal mt-6">Directions from {a.name} <ArrowUpRight size={16} aria-hidden="true" /></a> : null}
          </div>
        </div>
      </section>

      {/* Why us + hours */}
      <section className="wrap section grid gap-10 lg:grid-cols-[1.2fr_0.8fr]" aria-labelledby="why-h">
        <div>
          <h2 id="why-h" className="headline-large">Why make the trip</h2>
          <ul className="mt-8 space-y-6">
            <li className="flex gap-4"><Stethoscope size={24} aria-hidden="true" className="shrink-0 text-[var(--md-sys-color-primary)]" /><span className="body-large"><strong>Led by an orthopaedic surgeon.</strong> {ORTHO.name} directs clinical care, so an orthopaedic opinion is a quick referral away.</span></li>
            <li className="flex gap-4"><UserRound size={24} aria-hidden="true" className="shrink-0 text-[var(--md-sys-color-primary)]" /><span className="body-large"><strong>One-to-one, every session.</strong> {sessionMins} minutes with your physiotherapist, never a shared session.</span></li>
            <li className="flex gap-4"><ArrowRight size={24} aria-hidden="true" className="shrink-0 text-[var(--md-sys-color-primary)]" /><span className="body-large"><strong>Fees agreed first.</strong> An itemised estimate before treatment starts. <Link href="/pricing">See our fees</Link>.</span></li>
          </ul>
        </div>
        <aside className="band on-band h-fit rounded-[var(--md-sys-shape-xl)] p-8" aria-labelledby="hrs-h">
          <h2 id="hrs-h" className="headline-small">Clinic opening hours</h2>
          {hours.length ? (
            <dl className="body-medium mt-5 space-y-3">
              {groupHours(hours).map((g) => <div key={g.days}><dt className="muted">{g.days}</dt><dd className="text-white">{g.hours}</dd></div>)}
            </dl>
          ) : <p className="muted mt-3">Call us for today&apos;s hours.</p>}
          <Link href="/book" className="btn btn-on-band mt-6 w-full">Request appointment</Link>
        </aside>
      </section>

      {/* FAQ (visible only; no FAQPage markup, per §14.3) */}
      <section className="wrap section pt-0" aria-labelledby="faq-h">
        <h2 id="faq-h" className="headline-large">Questions from {a.name}</h2>
        <div className="mt-6 max-w-3xl divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
          {faqs.map((f) => (
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

      {/* Other areas */}
      <nav className="bg-[var(--md-sys-color-surface-container)]" aria-labelledby="areas-h">
        <div className="wrap section">
          <h2 id="areas-h" className="headline-small">Other areas we serve</h2>
          <ul className="mt-5 flex flex-wrap gap-2">
            <li><Link href="/physiotherapy-hsr-layout" className="btn btn-tonal">HSR Layout</Link></li>
            {others.map((o) => <li key={o.slug}><Link href={`/physiotherapy/${o.slug}`} className="btn btn-tonal">{o.name}</Link></li>)}
          </ul>
        </div>
      </nav>
    </>
  );
}
