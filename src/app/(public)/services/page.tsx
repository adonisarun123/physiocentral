import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getPublicServices } from "@/modules/content/public";
import { formatINR } from "@/modules/billing/money";
import { PageHero } from "@/components/site/page-hero";
import { Icon, iconForCategory } from "@/components/site/icon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Services",
  description: "Physiotherapy services offered by the clinic, with session length and fees or fee policy.",
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const services = await getPublicServices();
  const byCat = new Map<string, typeof services>();
  for (const s of services) {
    const k = s.category ?? "Other";
    byCat.set(k, [...(byCat.get(k) ?? []), s]);
  }
  return (
    <>
      <PageHero
        eyebrow="What we do"
        title={<>Physiotherapy <em>services</em></>}
        lead="Your therapist recommends care after assessing you. A listing here doesn't mean a service suits every condition."
      >
        <Link href="/book" className="btn btn-primary">Not sure? Book an assessment <ArrowRight size={18} aria-hidden="true" /></Link>
      </PageHero>
      <div className="mx-auto max-w-6xl px-4 py-12">
        {services.length === 0 ? (
          <div className="card max-w-2xl">
            <p className="font-semibold">Service descriptions are being reviewed by the clinic&apos;s clinical lead.</p>
            <p className="mt-1 text-[var(--color-ink-muted)]">They&apos;ll be published here soon. Please <Link href="/contact">contact the clinic</Link> in the meantime.</p>
          </div>
        ) : (
          [...byCat.entries()].map(([cat, list]) => (
            <section key={cat} className="mb-12" aria-labelledby={`cat-${cat}`}>
              <h2 id={`cat-${cat}`} className="font-display mb-4 text-2xl font-semibold">{cat}</h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((s) => (
                  <li key={s.id}>
                    <Link href={`/services/${s.slug}`} className="card card-hover flex h-full flex-col gap-3 no-underline">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-sky)] text-[var(--color-ink)]"><Icon name={iconForCategory(s.category)} size={22} /></span>
                      <span className="font-display text-xl font-semibold text-[var(--color-ink)]">{s.name}</span>
                      {s.summary ? <span className="text-[var(--color-ink-muted)]">{s.summary}</span> : null}
                      <span className="mt-auto flex flex-wrap gap-2 pt-2 text-sm">
                        <span className="chip">About {s.durationMinutes} min</span>
                        <span className="chip">{s.pricePaise ? `${formatINR(s.pricePaise)} / ${s.billingUnit.toLowerCase()}` : (s.feePolicyText ?? "Fee after assessment")}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}
