import Link from "next/link";
import type { Metadata } from "next";
import { getPublicServices } from "@/modules/content/public";
import { formatINR } from "@/modules/billing/money";
import { PageHeader } from "@/components/ui";

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
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title="Services" lead="Your therapist decides the right care after assessment. Listing here does not mean a service suits every condition." />
      {services.length === 0 ? (
        <p className="prose-clinic">Service descriptions are being reviewed by the clinic&apos;s clinical lead and will be published here. Please <Link href="/contact">contact the clinic</Link> in the meantime.</p>
      ) : (
        [...byCat.entries()].map(([cat, list]) => (
          <section key={cat} className="mb-10" aria-labelledby={`cat-${cat}`}>
            <h2 id={`cat-${cat}`} className="mb-3 text-xl font-bold">{cat}</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {list.map((s) => (
                <li key={s.id} className="card">
                  <h3 className="text-lg font-bold"><Link href={`/services/${s.slug}`}>{s.name}</Link></h3>
                  {s.summary ? <p className="mt-1">{s.summary}</p> : null}
                  <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                    About {s.durationMinutes} minutes · {s.pricePaise ? `${formatINR(s.pricePaise)} per ${s.billingUnit.toLowerCase()}` : (s.feePolicyText ?? "Fee confirmed after assessment")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
