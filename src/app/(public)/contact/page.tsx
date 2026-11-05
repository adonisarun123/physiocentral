import type { Metadata } from "next";
import Link from "next/link";
import { Phone, Mail, MapPin, CalendarCheck, Navigation, Info, ArrowUpRight } from "lucide-react";
import { getOpeningHours, getPublicBranches, getPublicClinic, getPublicServices } from "@/modules/content/public";
import { JsonLd, clinicJsonLd } from "@/modules/content/schema";
import { telHref, displayPhone, WEEKDAYS, dayHours } from "@/lib/format";
import { PageHero } from "@/components/site/page-hero";
import { ORTHO } from "@/components/site/ortho-referral";
import { pageOpenGraph } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Contact & visit us",
  description: "Call, book online or visit Physio Central in HSR Layout, Bengaluru — address, map, opening hours and directions.",
  alternates: { canonical: "/contact" },
  openGraph: pageOpenGraph("/contact"),
};

/** Keyless Google Maps embed (no API key, no cookies until the user interacts). */
function mapEmbedSrc(query: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed&z=17`;
}

export default async function ContactPage() {
  const [clinic, branches, services] = await Promise.all([getPublicClinic(), getPublicBranches(), getPublicServices()]);
  const b = branches[0];
  const hours = b ? await getOpeningHours(b.id) : [];
  const ld = clinic && b ? clinicJsonLd(clinic, b, services, hours) : null;
  const phone = b?.phone ?? clinic?.phone ?? null;
  const address = b?.addressVerified ? [b.addressLine, b.locality, b.city, b.region, b.postalCode].filter(Boolean).join(", ") : null;
  const mapQuery = b?.latitude && b.longitude ? `${b.latitude},${b.longitude}` : address ? `Physio Central, ${address}` : null;
  const directionsUrl = address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : b?.mapUrl ?? null;

  const actions = [
    phone ? { icon: Phone, title: "Call the clinic", value: displayPhone(phone), href: telHref(phone)!, tone: "primary" } : null,
    { icon: CalendarCheck, title: "Book online", value: "Request a time in about 2 minutes", href: "/book", tone: "secondary" },
    directionsUrl ? { icon: Navigation, title: "Get directions", value: "Open turn-by-turn in Google Maps", href: directionsUrl, tone: "tertiary", external: true } : null,
    clinic?.email ? { icon: Mail, title: "Email", value: clinic.email, href: `mailto:${clinic.email}`, tone: "tertiary" } : null,
  ].filter(Boolean) as { icon: typeof Phone; title: string; value: string; href: string; tone: string; external?: boolean }[];

  return (
    <>
      {ld ? <JsonLd data={ld} /> : null}
      <PageHero
        eyebrow="Contact & visit us"
        title="Talk to us, or come and see us"
        lead={address ? `${b!.name} — ${b!.locality}, ${b!.city}. Call, request an appointment online, or drop in during opening hours.` : "Call us, or send an appointment request online and we'll confirm a time with you."}
      />

      {/* Quick actions */}
      <section className="wrap pt-12" aria-label="Ways to reach us">
        <ul className={`grid gap-4 sm:grid-cols-2 ${actions.length >= 3 ? "lg:grid-cols-3" : ""}`}>
          {actions.map((it, i) => (
            <li key={it.title} data-reveal={String(i * 60)}>
              <a href={it.href} {...(it.external ? { target: "_blank", rel: "noopener" } : {})} className="card card-hover flex h-full items-center gap-4 no-underline">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--md-sys-shape-md)]" style={{ background: `var(--md-sys-color-${it.tone}-container)`, color: `var(--md-sys-color-on-${it.tone}-container)` }}><it.icon size={22} aria-hidden="true" /></span>
                <span className="flex flex-col">
                  <span className="title-medium text-[var(--color-ink)]">{it.title}</span>
                  <span className="body-medium text-[var(--color-ink-muted)]">{it.value}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Map + address + hours */}
      <section id="visit" className="wrap section grid scroll-mt-28 gap-10 lg:grid-cols-[1.35fr_0.65fr]" aria-labelledby="visit-h">
        <div className="flex flex-col gap-6" data-reveal>
          <h2 id="visit-h" className="headline-large">Find the clinic</h2>
          {mapQuery ? (
            <div className="overflow-hidden rounded-[var(--md-sys-shape-xl)] border border-[var(--color-line)] bg-[var(--md-sys-color-surface-container)]">
              <iframe
                title={`Map showing ${b?.name ?? "the clinic"}`}
                src={mapEmbedSrc(mapQuery)}
                className="block h-[22rem] w-full sm:h-[28rem]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="card-filled"><p className="body-medium">The clinic&apos;s address and map will be published once verified. Please call for directions.</p></div>
          )}
          {address ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="title-small flex items-center gap-2"><MapPin size={16} aria-hidden="true" /> Address</p>
                <address className="body-large mt-2 not-italic">{address}</address>
                {directionsUrl ? <a href={directionsUrl} target="_blank" rel="noopener" className="link-arrow mt-3 inline-flex text-[var(--md-sys-color-primary)]">Directions <ArrowUpRight size={16} aria-hidden="true" /></a> : null}
              </div>
              {b?.accessNotes ? (
                <div>
                  <p className="title-small flex items-center gap-2"><Info size={16} aria-hidden="true" /> Getting in</p>
                  <p className="body-medium mt-2 whitespace-pre-line text-[var(--color-ink-muted)]">{b.accessNotes}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="flex h-fit flex-col gap-6" data-reveal="80">
          <section className="band on-band rounded-[var(--md-sys-shape-xl)] p-8" aria-labelledby="hours-h">
            <h2 id="hours-h" className="headline-small">Opening hours</h2>
            {hours.length === 0 ? <p className="muted mt-3">Call us for today&apos;s hours.</p> : (
              <dl className="mt-5 divide-y divide-white/15">
                {[1, 2, 3, 4, 5, 6, 0].map((i) => {
                  const h = dayHours(hours, i);
                  return <div key={i} className="flex justify-between gap-4 py-2.5"><dt className="muted">{WEEKDAYS[i]}</dt><dd className={h ? "text-right text-white" : "muted"}>{h ?? "Closed"}</dd></div>;
                })}
              </dl>
            )}
            <p className="body-small muted mt-4">Times in IST. Holiday closures are announced here.</p>
          </section>
          <div className="card">
            <p className="title-medium">Orthopaedic query?</p>
            <p className="body-medium mt-1 text-[var(--color-ink-muted)]">Fractures, surgery or a specialist opinion: contact {ORTHO.name}&apos;s orthopaedic practice directly.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={ORTHO.contactUrl} target="_blank" rel="noopener" className="btn btn-tonal">Ortho clinic <ArrowUpRight size={16} aria-hidden="true" /></a>
              <a href={ORTHO.phoneHref} className="btn btn-secondary">{ORTHO.phone}</a>
            </div>
          </div>
          <p className="body-small text-[var(--color-ink-muted)]">Please don&apos;t send medical details by email. In an emergency, call 112.</p>
        </aside>
      </section>
      <p className="sr-only"><Link href="/book">Request an appointment</Link></p>
    </>
  );
}
