import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicTherapist } from "@/modules/content/public";
import { JsonLd, siteUrl } from "@/modules/content/schema";

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
    <article className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Person", name: t.displayName, jobTitle: t.designation, url: siteUrl(`/team/${t.slug}`) }} />
      <h1 className="text-3xl font-extrabold">{t.displayName}</h1>
      <p className="text-lg text-[var(--color-ink-muted)]">{t.designation}</p>
      {t.bio ? <p className="prose-clinic mt-4 whitespace-pre-line">{t.bio}</p> : null}
      {t.languages.length ? <p className="mt-4">Languages: {t.languages.join(", ")}</p> : null}
      <Link href="/book" className="btn btn-primary mt-8">Request an appointment</Link>
    </article>
  );
}
