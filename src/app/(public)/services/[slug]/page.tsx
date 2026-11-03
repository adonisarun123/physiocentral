import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicService } from "@/modules/content/public";
import { formatINR } from "@/modules/billing/money";
import { JsonLd, breadcrumbJsonLd } from "@/modules/content/schema";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await getPublicService((await params).slug);
  if (!s) return { title: "Service not found", robots: { index: false } };
  return { title: s.name, description: s.summary ?? `${s.name} at the clinic.`, alternates: { canonical: `/services/${s.slug}` } };
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const s = await getPublicService((await params).slug);
  if (!s) notFound(); // real 404, not a soft 404 (SEO-05)
  const sections: [string, string | null][] = [
    ["Who it may help", s.whoItMayHelp],
    ["What to expect", s.whatToExpect],
    ["Limitations", s.limitations],
  ];
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd data={breadcrumbJsonLd([{ name: "Services", path: "/services" }, { name: s.name, path: `/services/${s.slug}` }])} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href="/services">Services</Link> <span aria-hidden="true">›</span> <span aria-current="page">{s.name}</span>
      </nav>
      <h1 className="text-3xl font-extrabold">{s.name}</h1>
      {s.summary ? <p className="prose-clinic mt-3 text-lg">{s.summary}</p> : null}
      <dl className="card mt-6 grid gap-3 sm:grid-cols-2">
        <div><dt className="font-semibold">Approximate duration</dt><dd>{s.durationMinutes} minutes</dd></div>
        <div><dt className="font-semibold">Fee</dt><dd>{s.pricePaise ? `${formatINR(s.pricePaise)} per ${s.billingUnit.toLowerCase()}` : (s.feePolicyText ?? "Confirmed after assessment")}</dd></div>
      </dl>
      {s.body ? <div className="prose-clinic mt-6 whitespace-pre-line">{s.body}</div> : null}
      {sections.map(([h, body]) => body ? (
        <section key={h} className="mt-6">
          <h2 className="text-xl font-bold">{h}</h2>
          <p className="prose-clinic mt-2 whitespace-pre-line">{body}</p>
        </section>
      ) : null)}
      <p className="mt-6 text-sm text-[var(--color-ink-muted)]">
        Clinically reviewed by {s.clinicalReviewer}{s.reviewedOn ? ` on ${s.reviewedOn}` : ""}. This page is general information, not a diagnosis.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {s.bookable ? <Link href={`/book?service=${s.id}`} className="btn btn-primary">Request this service</Link> : (
          <p>This service is not available for online requests. Please <Link href="/contact">contact the clinic</Link>.</p>
        )}
      </div>
    </article>
  );
}
