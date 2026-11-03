import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicTherapist } from "@/modules/content/public";
import { JsonLd, siteUrl } from "@/modules/content/schema";
import { PageHero } from "@/components/site/page-hero";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await getPublicTherapist((await params).slug);
  if (!t) return { title: "Not found", robots: { index: false } };
  return { title: `${t.displayName}, ${t.designation}`, alternates: { canonical: `/team/${t.slug}` } };
}

export default async function TherapistPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getPublicTherapist((await params).slug);
  if (!t) notFound();
  return (
    <article>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Person", name: t.displayName, jobTitle: t.designation, url: siteUrl(`/team/${t.slug}`) }} />
      <PageHero eyebrow="Our team" title={t.displayName} lead={t.designation}>
        <Link href="/book" className="btn btn-primary">Request an appointment</Link>
      </PageHero>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
        {t.bio ? <p className="prose-clinic whitespace-pre-line text-lg">{t.bio}</p> : null}
        {t.languages.length ? <p className="mt-6 flex flex-wrap items-center gap-2"><span className="font-semibold">Languages:</span> {t.languages.map((l) => <span key={l} className="chip">{l}</span>)}</p> : null}
      </div>
    </article>
  );
}
