import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicServices, getPublicTherapist, getTherapistServiceSlugs } from "@/modules/content/public";
import { JsonLd, relatedLinkProp, siteUrl } from "@/modules/content/schema";
import { PageHero } from "@/components/site/page-hero";
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
      <PageHero eyebrow="Our team" title={t.displayName} lead={t.designation}>
        <Link href="/book" className="btn btn-primary">Request appointment</Link>
      </PageHero>
      <div className={`wrap section${t.photo ? " grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:items-start" : ""}`}>
        {t.photo ? (
          <span className="relative block aspect-[4/5] max-h-[32rem] overflow-hidden rounded-[var(--md-sys-shape-xl)] bg-[var(--md-sys-color-surface-container)]">
            <Image src={t.photo} alt={`${t.displayName}, ${t.designation}`} fill priority sizes="(min-width: 1024px) 35vw, 100vw" className="object-cover" />
          </span>
        ) : null}
        <div>
          {t.bio ? <p className="body-large prose-clinic whitespace-pre-line">{t.bio}</p> : null}
          {t.languages.length ? <p className="mt-6 flex flex-wrap items-center gap-2"><span className="title-small">Languages:</span> {t.languages.map((l) => <span key={l} className="chip">{l}</span>)}</p> : null}
          {services.length ? (
            <section aria-labelledby="provides-h" className="mt-10">
              <h2 id="provides-h" className="headline-small">Services {t.displayName} provides</h2>
              <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {services.map((s) => <li key={s.id}><Link href={`/services/${s.slug}`}>{s.name}</Link></li>)}
              </ul>
            </section>
          ) : null}
          <p className="mt-10"><Link href="/team" className="link-arrow text-[var(--md-sys-color-primary)]">Meet the whole team</Link></p>
        </div>
      </div>
    </article>
  );
}
