import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, CalendarCheck, Clock, MapPin, Navigation, Phone, Plus, UserRound, ReceiptText, House, Stethoscope } from "lucide-react";
import { getOpeningHours, getPublicBranches, getPublicClinic, getPublicServices, getPublicTherapists } from "@/modules/content/public";
import { JsonLd, breadcrumbJsonLd, clinicJsonLd, siteUrl } from "@/modules/content/schema";
import { telHref, displayPhone, groupHours } from "@/lib/format";
import { PageHero } from "@/components/site/page-hero";
import { MediaPanel, serviceImage } from "@/components/site/media";
import { ORTHO } from "@/components/site/ortho-referral";
import { getPost } from "@/content/blog/posts";
import { AREAS } from "@/content/areas";
import { pageOpenGraph } from "@/lib/seo";

export const dynamic = "force-dynamic";

const PATH = "/physiotherapy-hsr-layout";

export const metadata: Metadata = {
  title: "Physiotherapy Clinic in HSR Layout, Bengaluru",
  description: "One-to-one physiotherapy in Sector 2, HSR Layout, led by orthopaedic surgeon Dr Nitin Sunku. Back and neck pain, sports injuries, rehab after surgery and home visits. Open mornings, evenings and Sundays.",
  alternates: { canonical: PATH },
  openGraph: pageOpenGraph(PATH, { title: "Physiotherapy Clinic in HSR Layout, Bengaluru | Physio Central" }),
};

/** Neighbouring localities (geographic proximity only, no claim about travel times or home-visit coverage). */
const NEARBY = ["Agara", "Koramangala", "Bellandur", "BTM Layout", "Bommanahalli", "Haralur", "Kudlu", "Sarjapur Road"];

const LOCAL_GUIDES = [
  "desk-job-neck-and-back-pain-hsr-layout",
  "common-running-injuries-hsr-layout-runners",
  "choosing-a-physiotherapist-in-hsr-layout",
];

export default async function HsrLayoutPage() {
  const [clinic, branches, services, team] = await Promise.all([getPublicClinic(), getPublicBranches(), getPublicServices(), getPublicTherapists()]);
  const b = branches[0];
  const hours = b ? await getOpeningHours(b.id) : [];
  const clinicLd = clinic && b ? clinicJsonLd(clinic, b, services, hours) : null;
  const phone = b?.phone ?? clinic?.phone ?? null;
  const address = b?.addressVerified ? [b.addressLine, b.locality, b.city, b.region, b.postalCode].filter(Boolean).join(", ") : null;
  const directionsUrl = address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : b?.mapUrl ?? null;
  const mapQuery = b?.latitude && b.longitude ? `${b.latitude},${b.longitude}` : address ? `Physio Central, ${address}` : null;
  const sessionMins = services.find((s) => s.bookable && !/assess/i.test(s.slug))?.durationMinutes ?? 45;
  const response = b?.responseWindow ?? "within one working day";
  const guides = LOCAL_GUIDES.map((s) => getPost(s)).filter(Boolean) as NonNullable<ReturnType<typeof getPost>>[];

  const reasons = [
    { icon: Stethoscope, title: "Led by an orthopaedic surgeon", body: `Clinical care is directed by ${ORTHO.name}, consultant orthopaedic and sports-medicine surgeon and Team Doctor for Bengaluru FC.` },
    { icon: UserRound, title: "One-to-one, every session", body: `${sessionMins} minutes with your physiotherapist. Never a shared or group session.` },
    { icon: ReceiptText, title: "Fees agreed first", body: "An itemised estimate before treatment starts. Nothing is added without your approval." },
    { icon: Clock, title: "Before and after work", body: "Early-morning and late-evening slots on weekdays and Saturdays, plus Sunday mornings." },
    { icon: CalendarCheck, title: "Book online", body: `Request a time in about two minutes. We confirm ${response}.` },
    { icon: House, title: "Home visits", body: "For the weeks after surgery, or when travel is hard. Arranged by phone." },
  ];

  const faqs = [
    { q: "Where exactly is the clinic?", a: address ? `${address}.${b?.accessNotes ? ` ${b.accessNotes}` : ""}` : "Please call the clinic for directions." },
    { q: "What are your opening hours?", a: hours.length ? groupHours(hours).map((g) => `${g.days}: ${g.hours}`).join(". ") + "." : "Please call the clinic for today's hours." },
    { q: "How long is a session?", a: `Treatment sessions are ${sessionMins} minutes, one-to-one with a physiotherapist. Your first visit is an assessment.` },
    { q: "How do I book?", a: `Request an appointment online in about two minutes and we confirm ${response}, or call the clinic${phone ? ` on ${displayPhone(phone)}` : ""}.` },
    { q: "Do you offer home physiotherapy in HSR Layout?", a: "Yes. Home visits are arranged by phone so we can confirm we can reach your area, a convenient time, and any travel fee before booking." },
    { q: "What if I need a doctor or a scan?", a: `If your assessment shows you need an orthopaedic opinion, your physiotherapist can refer you to ${ORTHO.name}'s orthopaedic practice, with your notes going along.` },
  ];

  const pageLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": siteUrl(`${PATH}#page`),
        url: siteUrl(PATH),
        name: "Physiotherapy clinic in HSR Layout, Bengaluru",
        about: { "@id": siteUrl("/contact#clinic") },
      },
      breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Physiotherapy in HSR Layout", path: PATH }]),
    ],
  };

  return (
    <>
      {clinicLd ? <JsonLd data={clinicLd} /> : null}
      <JsonLd data={pageLd} />

      <PageHero
        eyebrow="HSR Layout, Bengaluru"
        title="Physiotherapy clinic in HSR Layout"
        lead={`Physio Central is a physiotherapy clinic in Sector 2, HSR Layout, led by orthopaedic surgeon ${ORTHO.name}. One-to-one care for back and neck pain, joint problems, sports injuries and recovery after surgery, with fees agreed before treatment starts.`}
        tone="band"
      >
        <Link href="/book" className="btn btn-on-band">Request appointment</Link>
        {phone ? <a href={telHref(phone)} className="btn btn-secondary"><Phone size={18} aria-hidden="true" /> {displayPhone(phone)}</a> : null}
      </PageHero>

      {/* Why patients choose us */}
      <section className="wrap section" aria-labelledby="why-h">
        <p className="eyebrow">Why Physio Central</p>
        <h2 id="why-h" className="headline-large mt-2 max-w-3xl">Specialist-led physiotherapy, close to home</h2>
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {reasons.map((r, i) => (
            <li key={r.title} className="card h-full" data-reveal={String((i % 3) * 60)}>
              <r.icon size={24} aria-hidden="true" className="text-[var(--md-sys-color-primary)]" />
              <h3 className="title-large mt-3">{r.title}</h3>
              <p className="body-medium mt-2 text-[var(--color-ink-muted)]">{r.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Services */}
      {services.length ? (
        <section className="bg-[var(--md-sys-color-surface-container-low)]" aria-labelledby="svc-h">
          <div className="wrap section">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Services</p>
                <h2 id="svc-h" className="headline-large mt-2">Physiotherapy services in HSR Layout</h2>
              </div>
              <Link href="/conditions" className="link-arrow text-[var(--md-sys-color-primary)]">Conditions we treat <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
            <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {services.map((s, i) => (
                <li key={s.slug} data-reveal={String((i % 4) * 60)}>
                  <Link href={`/services/${s.slug}`} className="group flex h-full flex-col no-underline">
                    <MediaPanel icon="Activity" index={i} src={serviceImage(s.slug)} className="aspect-[4/3] rounded-[var(--md-sys-shape-md)]" />
                    <span className="title-large mt-4 text-[var(--color-ink)] group-hover:underline">{s.name}</span>
                    {s.summary ? <span className="body-medium mt-1 line-clamp-3 text-[var(--color-ink-muted)]">{s.summary}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* Finding us */}
      <section id="find-us" className="wrap section grid scroll-mt-28 gap-10 lg:grid-cols-[1.2fr_0.8fr]" aria-labelledby="find-h">
        <div data-reveal>
          <p className="eyebrow">Visit us</p>
          <h2 id="find-h" className="headline-large mt-2">Finding the clinic in HSR Layout</h2>
          {address ? (
            <>
              <address className="body-large mt-5 not-italic"><MapPin size={18} aria-hidden="true" className="mr-2 inline text-[var(--md-sys-color-primary)]" />{address}</address>
              {b?.accessNotes ? <p className="body-medium mt-3 whitespace-pre-line text-[var(--color-ink-muted)]">{b.accessNotes}</p> : null}
            </>
          ) : <p className="body-large mt-5">Please call the clinic for directions.</p>}
          <p className="body-large mt-6 text-[var(--color-ink-muted)]">
            If you live or work in HSR Layout or a neighbouring area such as {NEARBY.slice(0, -1).join(", ")} or {NEARBY.at(-1)}, the clinic is a short trip away. Choose an early-morning or evening slot to work around the commute.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {directionsUrl ? <a href={directionsUrl} target="_blank" rel="noopener" className="btn btn-primary"><Navigation size={18} aria-hidden="true" /> Get directions</a> : null}
            <Link href="/contact" className="btn btn-secondary">Contact &amp; visit</Link>
          </div>
          <p className="body-medium mt-6 text-[var(--color-ink-muted)]">
            Coming from further away? See how to reach us, and where we offer home visits, from{" "}
            {AREAS.map((a, i) => <span key={a.slug}>{i ? (i === AREAS.length - 1 ? " and " : ", ") : ""}<Link href={`/physiotherapy/${a.slug}`}>{a.name}</Link></span>)}.
          </p>
          {mapQuery ? (
            <div className="mt-8 overflow-hidden rounded-[var(--md-sys-shape-xl)] border border-[var(--color-line)] bg-[var(--md-sys-color-surface-container)]">
              <iframe title="Map showing Physio Central in HSR Layout" src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed&z=16`} className="block h-[20rem] w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
            </div>
          ) : null}
        </div>
        <aside className="flex h-fit flex-col gap-6" data-reveal="80">
          <section className="band on-band rounded-[var(--md-sys-shape-xl)] p-8" aria-labelledby="hrs-h">
            <h2 id="hrs-h" className="headline-small">Opening hours</h2>
            {hours.length ? (
              <dl className="body-medium mt-5 space-y-3">
                {groupHours(hours).map((g) => <div key={g.days}><dt className="muted">{g.days}</dt><dd className="text-white">{g.hours}</dd></div>)}
              </dl>
            ) : <p className="muted mt-3">Call us for today&apos;s hours.</p>}
            <Link href="/book" className="btn btn-on-band mt-6 w-full">Request appointment</Link>
          </section>
          <div className="card">
            <p className="title-medium">Orthopaedic query?</p>
            <p className="body-medium mt-1 text-[var(--color-ink-muted)]">Fractures, surgery or a specialist opinion: contact {ORTHO.name}&apos;s orthopaedic practice.</p>
            <a href={ORTHO.url} target="_blank" rel="noopener" className="btn btn-tonal mt-4">Orthopaedic practice <ArrowUpRight size={16} aria-hidden="true" /></a>
          </div>
        </aside>
      </section>

      {/* Team */}
      <section className="bg-[var(--md-sys-color-surface-container)]" aria-labelledby="team-h">
        <div className="wrap section">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Our team</p>
              <h2 id="team-h" className="headline-large mt-2">Your physiotherapists in HSR Layout</h2>
            </div>
            <Link href="/team" className="link-arrow text-[var(--md-sys-color-primary)]">Meet the team <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <li>
              <Link href="/about#doctor-h" className="group flex h-full flex-col no-underline">
                <span className="relative block aspect-[4/5] overflow-hidden rounded-[var(--md-sys-shape-md)] bg-[var(--md-sys-color-surface-container-high)]">
                  <Image src="/images/team/dr-nitin-sunku.webp" alt={`${ORTHO.name}, clinical lead`} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover object-top" />
                </span>
                <span className="title-large mt-4 text-[var(--color-ink)] group-hover:underline">{ORTHO.name}</span>
                <span className="body-medium text-[var(--color-ink-muted)]">Clinical lead · Consultant orthopaedic surgeon</span>
              </Link>
            </li>
            {team.slice(0, 3).map((t) => (
              <li key={t.id}>
                <Link href={`/team/${t.slug}`} className="group flex h-full flex-col no-underline">
                  <span className="relative block aspect-[4/5] overflow-hidden rounded-[var(--md-sys-shape-md)] bg-[var(--md-sys-color-surface-container-high)]">
                    {t.photo ? <Image src={t.photo} alt={`${t.displayName}, ${t.designation}`} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover object-top" /> : null}
                  </span>
                  <span className="title-large mt-4 text-[var(--color-ink)] group-hover:underline">{t.displayName}</span>
                  <span className="body-medium text-[var(--color-ink-muted)]">{t.designation}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Local guides */}
      {guides.length ? (
        <section className="wrap section" aria-labelledby="guides-h">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Guides</p>
              <h2 id="guides-h" className="headline-large mt-2">For people who live and work in HSR Layout</h2>
            </div>
            <Link href="/blog" className="link-arrow text-[var(--md-sys-color-primary)]">All guides <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((g, i) => (
              <li key={g.slug} data-reveal={String(i * 80)}>
                <Link href={`/blog/${g.slug}`} className="group flex h-full flex-col no-underline">
                  <MediaPanel icon="Activity" index={i} src={g.image} alt={g.imageAlt} className="aspect-[16/10] rounded-[var(--md-sys-shape-md)]" />
                  <span className="label-large mt-4 text-[var(--md-sys-color-tertiary)]">{g.category}</span>
                  <span className="title-large mt-1 text-[var(--color-ink)] group-hover:underline">{g.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* FAQ (visible only; no FAQPage markup, per §14.3) */}
      <section className="wrap section pt-0" aria-labelledby="faq-h">
        <h2 id="faq-h" className="headline-large">Questions about visiting</h2>
        <div className="mt-6 max-w-3xl divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
          {faqs.map((f) => (
            <details key={f.q} className="faq">
              <summary className="state flex min-h-16 items-center justify-between gap-4 rounded-[var(--md-sys-shape-sm)] px-2 py-4">
                <span className="title-large">{f.q}</span>
                <span className="faq-icon grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--md-sys-color-primary)]"><Plus size={22} aria-hidden="true" /></span>
              </summary>
              <p className="body-large px-2 pb-6 text-[var(--color-ink-muted)]">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="body-small mt-8 text-[var(--color-ink-muted)]">General information, not a diagnosis. In an emergency, call 112.</p>
      </section>
    </>
  );
}
