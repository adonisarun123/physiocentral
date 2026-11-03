import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getOpeningHours, getPublicBranches, getPublicClinic, getPublicServices } from "@/modules/content/public";
import { JsonLd, clinicJsonLd } from "@/modules/content/schema";
import { Notice } from "@/components/ui";
import { PageHero } from "@/components/site/page-hero";
import { WEEKDAYS, telHref, displayPhone } from "@/lib/format";

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
  const ld = clinic ? clinicJsonLd(clinic, b, services) : null;
  return (
    <>
    {ld ? <JsonLd data={ld} /> : null}
    <PageHero eyebrow="Location" title={<>{b.name}</>} />
    <div className="mx-auto max-w-4xl px-4 py-12">
      {!b.addressVerified ? (
        <div className="mt-4"><Notice tone="warn" title="Address being confirmed">The clinic&apos;s address, map and access details will be published once verified. Please call or use the contact page for directions.</Notice></div>
      ) : (
        <address className="mt-4 not-italic">
          {[b.addressLine, b.locality, b.city, b.region, b.postalCode].filter(Boolean).join(", ")}
          {b.mapUrl ? <> · <a href={b.mapUrl} rel="noopener">Open in maps</a></> : null}
        </address>
      )}
      {b.phone ? <p className="mt-2">Phone: <a href={telHref(b.phone)}>{displayPhone(b.phone)}</a></p> : null}
      <section className="mt-8">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">Opening hours</h2>
        {hours.length === 0 ? <p className="mt-2 text-[var(--color-ink-muted)]">Hours will be published soon.</p> : (
          <table className="data mt-2 max-w-md"><tbody>
            {WEEKDAYS.map((d, i) => {
              const h = hours.find((x) => x.weekday === i);
              return <tr key={d}><th scope="row">{d}</th><td>{h ? `${h.opens} – ${h.closes}` : "Closed"}</td></tr>;
            })}
          </tbody></table>
        )}
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Times in {b.timezone === "Asia/Kolkata" ? "IST" : b.timezone}. Holiday closures are announced here.</p>
      </section>
      {b.accessNotes ? <section className="mt-8"><h2 className="font-display text-2xl font-extrabold tracking-tight">Access and parking</h2><p className="mt-2 whitespace-pre-line">{b.accessNotes}</p></section> : null}
      <Link href="/book" className="btn btn-primary mt-8">Request an appointment</Link>
    </div>
    </>
  );
}
