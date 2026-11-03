import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Clock, IndianRupee, ShieldCheck } from "lucide-react";
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
  const fee = s.pricePaise ? `${formatINR(s.pricePaise)} per ${s.billingUnit.toLowerCase()}` : (s.feePolicyText ?? "Confirmed after assessment");
  return (
    <article>
      <JsonLd data={breadcrumbJsonLd([{ name: "Services", path: "/services" }, { name: s.name, path: `/services/${s.slug}` }])} />
      <section className="aurora grid-dots border-b border-[var(--color-line)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16">
          <nav aria-label="Breadcrumb" className="mb-4 text-sm">
            <Link href="/services">Services</Link> <span aria-hidden="true">›</span> <span aria-current="page">{s.name}</span>
          </nav>
          {s.category ? <span className="eyebrow">{s.category}</span> : null}
          <h1 className="display mt-5 max-w-4xl text-[2.4rem] sm:text-[3.6rem]">{s.name}</h1>
          {s.summary ? <p className="prose-clinic mt-4 text-lg text-[var(--color-ink-muted)]">{s.summary}</p> : null}
        </div>
      </section>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1fr_20rem]">
        <div>
          {s.body ? <div className="prose-clinic whitespace-pre-line text-lg">{s.body}</div> : null}
          {sections.map(([h, body]) => body ? (
            <section key={h} className="mt-8">
              <h2 className="font-display text-2xl font-extrabold tracking-tight">{h}</h2>
              <p className="prose-clinic mt-2 whitespace-pre-line">{body}</p>
            </section>
          ) : null)}
          <p className="mt-10 flex items-start gap-2 text-sm text-[var(--color-ink-muted)]">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            Service listing confirmed by {s.clinicalReviewer}{s.reviewedOn ? ` on ${s.reviewedOn}` : ""}. General information, not a diagnosis.
          </p>
        </div>
        <aside className="card h-fit lg:sticky lg:top-28" aria-label="Booking summary">
          <dl className="space-y-3">
            {s.bookable ? <div className="flex items-center gap-3"><Clock size={20} className="text-[var(--color-brand)]" aria-hidden="true" /><div><dt className="text-sm text-[var(--color-ink-muted)]">Approximate duration</dt><dd className="font-semibold">{s.durationMinutes} minutes</dd></div></div> : null}
            <div className="flex items-center gap-3"><IndianRupee size={20} className="text-[var(--color-brand)]" aria-hidden="true" /><div><dt className="text-sm text-[var(--color-ink-muted)]">Fee</dt><dd className="font-semibold">{fee}</dd></div></div>
          </dl>
          {s.bookable ? (
            <Link href={`/book?service=${s.id}`} className="btn btn-primary mt-5 w-full">Request this service <ArrowRight size={18} aria-hidden="true" /></Link>
          ) : (
            <div className="mt-5">
              <p className="text-sm text-[var(--color-ink-muted)]">Book this service by phone — the clinic will arrange the right time with you.</p>
              <Link href="/contact" className="btn btn-primary mt-3 w-full">Call to book <ArrowRight size={18} aria-hidden="true" /></Link>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}
