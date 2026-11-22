import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getPublicServices, getPublicTherapist, getTherapistServiceSlugs } from "@/modules/content/public";
import { JsonLd, relatedLinkProp, siteUrl } from "@/modules/content/schema";
import { pageOpenGraph } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await getPublicTherapist((await params).slug);
  if (!t) return { title: "Not found", robots: { index: false } };
  return { title: `${t.displayName}, ${t.designation}`, alternates: { canonical: `/team/${t.slug}` }, openGraph: pageOpenGraph(`/team/${t.slug}`) };
}

export default async function TherapistPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getPublicTherapist((await params).slug);
  if (!t) notFound();
  // Services this physiotherapist provides, from the same skill rows that drive online booking.
  const [slugs, all] = await Promise.all([getTherapistServiceSlugs(t.id), getPublicServices()]);
  const services = all.filter((s) => slugs.includes(s.slug));
  const path = `/team/${t.slug}`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": siteUrl(`${path}#page`),
        url: siteUrl(path),
        name: `${t.displayName}, ${t.designation}`,
        about: { "@id": siteUrl(`${path}#person`) },
        ...relatedLinkProp(services.map((s) => `/services/${s.slug}`)),
      },
      {
        "@type": "Person",
        "@id": siteUrl(`${path}#person`),
        name: t.displayName,
        jobTitle: t.designation,
        url: siteUrl(path),
        ...(t.photo ? { image: siteUrl(t.photo) } : {}),
        worksFor: { "@type": "MedicalClinic", name: "Physio Central", url: siteUrl("/") },
        ...(t.languages.length ? { knowsLanguage: t.languages } : {}),
      },
    ],
  };
  return (
    <article>
      <JsonLd data={ld} />
      {/* Compact profile header: photo beside the name, so the name never sits alone above a screen of empty space. */}
      <header className="border-b border-[var(--color-line)] bg-[var(--md-sys-color-surface-container-low)]">
        <div className={`wrap py-10 sm:py-14${t.photo ? " grid items-center gap-8 md:grid-cols-[16rem_1fr] lg:grid-cols-[20rem_1fr] lg:gap-14" : ""}`} data-reveal>
          {t.photo ? (
            <span className="relative block aspect-[4/5] w-full max-w-[18rem] overflow-hidden rounded-[var(--md-sys-shape-xl)] bg-[var(--md-sys-color-surface-container)] md:max-w-none">
              <Image src={t.photo} alt={`${t.displayName}, ${t.designation}`} fill priority sizes="(min-width: 1024px) 20rem, (min-width: 768px) 16rem, 18rem" className="object-cover object-top" />
            </span>
          ) : null}
          <div>
            <span className="brand-rule" aria-hidden="true"><i /><i /><i /></span>
            <p className="eyebrow mt-5"><Link href="/team" className="no-underline hover:underline">Our team</Link></p>
            <h1 className="display-medium mt-3">{t.displayName}</h1>
            <p className="title-large mt-3 text-[var(--md-sys-color-primary)]">{t.designation}</p>
            {t.languages.length ? <p className="mt-5 flex flex-wrap items-center gap-2"><span className="title-small">Languages:</span> {t.languages.map((l) => <span key={l} className="chip">{l}</span>)}</p> : null}
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/book" className="btn btn-primary">Request appointment</Link>
              <Link href="/team" className="btn btn-secondary">Meet the whole team</Link>
            </div>
          </div>
        </div>
      </header>
      {t.bio || services.length ? (
        <div className={`wrap py-12 sm:py-16${t.bio && services.length ? " grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-start" : ""}`}>
          {t.bio ? (
            <section aria-labelledby="about-h">
              <h2 id="about-h" className="headline-small">About {t.displayName}</h2>
              <p className="body-large prose-clinic mt-4 whitespace-pre-line">{t.bio}</p>
            </section>
          ) : null}
          {services.length ? (
            <section aria-labelledby="provides-h" className="card">
              <h2 id="provides-h" className="title-large">Services {t.displayName} provides</h2>
              <ul className="mt-4 grid gap-2">
                {services.map((s) => (
                  <li key={s.id}>
                    <Link href={`/services/${s.slug}`} className="link-arrow text-[var(--md-sys-color-primary)]">{s.name} <ArrowRight size={14} aria-hidden="true" /></Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
