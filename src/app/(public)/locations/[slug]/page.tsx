import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getOpeningHours, getPublicBranches, getPublicClinic, getPublicServices } from "@/modules/content/public";
import { JsonLd, clinicJsonLd } from "@/modules/content/schema";
import { Notice } from "@/components/ui";
import { PageHero } from "@/components/site/page-hero";
import { WEEKDAYS, telHref, displayPhone, dayHours } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const branch = (await getPublicBranches()).find((x) => x.slug === slug);
  if (!branch) return { title: "Location not found", robots: { index: false } };
  // Index only real, verified branch pages (§3.1).
  return { title: branch.name, alternates: { canonical: `/locations/${slug}` }, robots: { index: branch.addressVerified } };
}

export default async function LocationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [branches, clinic, services] = await Promise.all([getPublicBranches(), getPublicClinic(), getPublicServices()]);
  const b = branches.find((x) => x.slug === slug);
  if (!b) notFound();
  const hours = await getOpeningHours(b.id);
  const ld = clinic ? clinicJsonLd(clinic, b, services, hours) : null;
  return (
    <>
    {ld ? <JsonLd data={ld} /> : null}
    <PageHero eyebrow="Visit us" title={b.name} lead={b.addressVerified ? `${b.locality ?? ""}${b.city ? `, ${b.city}` : ""}` : undefined} />
    <div className="wrap section grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
      <div>
        {!b.addressVerified ? (
          <Notice tone="warn" title="Address being confirmed">The clinic&apos;s address, map and access details will be published once verified. Please call or use the contact page for directions.</Notice>
        ) : (
          <>
            <h2 className="headline-large">Find us</h2>
            <address className="body-large mt-4 max-w-md not-italic">{[b.addressLine, b.locality, b.city, b.region, b.postalCode].filter(Boolean).join(", ")}</address>
          </>
        )}
        {b.accessNotes ? <div className="card-filled mt-8"><h3 className="title-large">Access and parking</h3><p className="body-medium mt-2 whitespace-pre-line">{b.accessNotes}</p></div> : null}
        <div className="mt-8 flex flex-wrap gap-3">
          {b.mapUrl ? <a href={b.mapUrl} rel="noopener" className="btn btn-primary">Open in Maps</a> : null}
          {b.phone ? <a href={telHref(b.phone)} className="btn btn-secondary">Call {displayPhone(b.phone)}</a> : null}
          <Link href="/book" className="btn btn-text">Request appointment</Link>
        </div>
      </div>
      <section className="band on-band h-fit rounded-[var(--md-sys-shape-xl)] p-8 sm:p-10" aria-labelledby="hours-h">
        <h2 id="hours-h" className="headline-medium">Opening hours</h2>
        {hours.length === 0 ? <p className="muted mt-3">Hours will be published soon.</p> : (
          <dl className="mt-6 divide-y divide-white/15">
            {[1, 2, 3, 4, 5, 6, 0].map((i) => {
              const h = dayHours(hours, i);
              return <div key={i} className="flex justify-between gap-4 py-3"><dt className="muted">{WEEKDAYS[i]}</dt><dd className={h ? "text-right text-white" : "muted"}>{h ?? "Closed"}</dd></div>;
            })}
          </dl>
        )}
        <p className="body-small muted mt-5">Times in {b.timezone === "Asia/Kolkata" ? "IST" : b.timezone}. Holiday closures are announced here.</p>
      </section>
    </div>
    </>
  );
}
