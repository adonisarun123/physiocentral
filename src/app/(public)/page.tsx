import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, CalendarCheck, UserRound, ReceiptText, House, Plus, Phone } from "lucide-react";
import { getOpeningHours, getPublicBranches, getPublicClinic, getPublicServices, getPublicTherapists } from "@/modules/content/public";
import { JsonLd, clinicJsonLd } from "@/modules/content/schema";
import { telHref, displayPhone, hoursSummary } from "@/lib/format";
import { BODY_AREAS } from "@/components/site/body-areas";
import { iconForCategory } from "@/components/site/icon";
import { HeroVisual, type HeroLiveData } from "@/components/site/hero-visual";
import { Marquee } from "@/components/site/marquee";
import { MediaPanel, serviceImage } from "@/components/site/media";
import { nextAvailableLabel, openStatus } from "@/modules/content/live";
import { ORTHO } from "@/components/site/ortho-referral";
import { pageOpenGraph } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" }, openGraph: pageOpenGraph("/") };

const CONDITIONS = ["Arthritis", "Fractures", "TKR & THR rehab", "Arthroscopy rehab", "Ligament & muscle injuries", "Sports injuries", "Neck & back pain", "Sciatica", "Posture correction", "Home visits"];
const FEATURED = ["post-surg", "spine", "sport"];
const TONE = ["secondary", "tertiary", "primary", "secondary"] as const;

export default async function HomePage() {
  const [clinic, branches, services, team] = await Promise.all([getPublicClinic(), getPublicBranches(), getPublicServices(), getPublicTherapists()]);
  const branch = branches[0];
  const hours = branch ? await getOpeningHours(branch.id) : [];
  const ld = clinic && branch ? clinicJsonLd(clinic, branch, services, hours) : null;
  const response = branch?.responseWindow ?? "within one working day";
  const firstBookable = services.find((s) => s.bookable);
  const [nextSlot, open] = branch
    ? await Promise.all([firstBookable ? nextAvailableLabel(branch.id, firstBookable.id) : Promise.resolve(null), openStatus(branch.id)])
    : [null, null];
  const live: HeroLiveData = { nextSlotLabel: nextSlot, openLabel: open?.label ?? null, openNow: open?.openNow ?? false, place: branch?.addressVerified ? "Sector 2, HSR Layout" : branch?.locality ?? null };
  const featured = FEATURED.map((k) => services.find((s) => s.slug.includes(k))).filter(Boolean) as typeof services;
  const cards = (featured.length === 3 ? featured : services.slice(0, 3));
  const sessionMins = services.find((s) => s.bookable && !/assess/i.test(s.slug))?.durationMinutes ?? 45;
  const openDays = new Set(hours.map((h) => h.weekday)).size;
  const phone = branch?.phone ?? clinic?.phone ?? null;

  const benefits = [
    { icon: CalendarCheck, title: "Book online", body: `Choose a time in about two minutes. We confirm ${response}.` },
    { icon: UserRound, title: "One-to-one care", body: `${sessionMins} minutes with your physiotherapist — never a shared session.` },
    { icon: ReceiptText, title: "Fees agreed first", body: "An itemised estimate before treatment starts. No surprises at the desk." },
    { icon: House, title: "Home visits", body: "When travelling isn't possible yet. Arranged by phone." },
  ];

  return (
    <>
      {ld ? <JsonLd data={ld} /> : null}

      {/* ───── Hero ───── */}
      <section>
        <div className="wrap grid items-center gap-14 pt-14 pb-20 lg:grid-cols-[1fr_1.08fr] lg:pt-20 lg:pb-24">
          <div data-reveal>
            <span className="brand-rule" aria-hidden="true"><i /><i /><i /></span>
            <h1 className="display-large mt-6 max-w-xl">Expert physiotherapy for every body</h1>
            <p className="body-large mt-5 max-w-lg text-[var(--color-ink-muted)]">A modern clinic experience built around your goals. Book online, one-to-one care, and fees agreed before treatment.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/book" className="btn btn-primary">Request appointment</Link>
              <Link href="/contact#visit" className="btn btn-secondary">Get directions <ArrowRight size={18} aria-hidden="true" /></Link>
            </div>
            <Link href="/about#doctor-h" className="group mt-10 flex max-w-lg items-center gap-4 border-t border-[var(--color-line)] pt-6 no-underline">
              <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-white shadow-sm">
                <Image src="/images/team/dr-nitin-sunku.webp" alt="" fill sizes="56px" className="object-cover object-top" />
              </span>
              <span className="body-medium text-[var(--color-ink-muted)]">
                Clinical direction by <span className="font-semibold text-[var(--color-ink)] group-hover:underline">{ORTHO.name}</span>, consultant orthopaedic &amp; sports-medicine surgeon
              </span>
            </Link>
          </div>
          <HeroVisual live={live} />
        </div>
      </section>

      {/* ───── Moving strip (Spear's credibility band) ───── */}
      <Marquee items={CONDITIONS} label="Conditions we treat" />

      {/* ───── Statement + benefits ───── */}
      <section className="section" aria-labelledby="why-h">
        <div className="wrap">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16" data-reveal>
            <h2 id="why-h" className="headline-large">Physiotherapy that starts with the cause, not just the symptom.</h2>
            <p className="body-large text-[var(--color-ink-muted)]">Every visit begins with a proper assessment. We explain what we find in plain words, agree a plan and its cost with you, then combine hands-on care with progressive strength work — so the results last after you stop coming.</p>
          </div>
          <ul className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b, i) => (
              <li key={b.title} data-reveal={String(i * 80)}>
                <span className="grid h-14 w-14 place-items-center rounded-[var(--md-sys-shape-lg)]" style={{ background: `var(--md-sys-color-${TONE[i]}-container)`, color: `var(--md-sys-color-on-${TONE[i]}-container)` }}>
                  <b.icon size={26} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h3 className="headline-small mt-5">{b.title}</h3>
                <p className="body-medium mt-2 text-[var(--color-ink-muted)]">{b.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───── Services (band) ───── */}
      {cards.length ? (
        <section className="band on-band section" aria-labelledby="svc-h">
          <div className="wrap flex flex-col items-center">
            <h2 id="svc-h" className="headline-large text-center" data-reveal>Personalised treatment. Lasting results.</h2>
            <ul className="mt-12 grid w-full gap-8 md:grid-cols-3">
              {cards.map((s, i) => (
                <li key={s.id} className="flex flex-col" data-reveal={String(i * 80)}>
                  <MediaPanel icon={iconForCategory(s.category)} index={i} src={serviceImage(s.slug)} className="aspect-[16/10] rounded-[var(--md-sys-shape-md)]" />
                  <h3 className="headline-small mt-6">{s.name}</h3>
                  {s.summary ? <p className="body-medium muted mt-2 line-clamp-3">{s.summary}</p> : null}
                  <Link href={`/services/${s.slug}`} className="btn btn-on-band mt-6 self-start">Explore {s.name.split(/ &| and /i)[0].toLowerCase()}</Link>
                </li>
              ))}
            </ul>
            <Link href="/services" className="link-arrow mt-14 text-white">Explore all {services.length} services <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
        </section>
      ) : null}

      {/* ───── Where it hurts (M3 suggestion chips) ───── */}
      <section className="section pb-0" aria-labelledby="hurt-h">
        <div className="wrap">
          <div className="max-w-2xl" data-reveal>
            <h2 id="hurt-h" className="headline-large">Not sure which service you need?</h2>
            <p className="body-large mt-4 text-[var(--color-ink-muted)]">Start with where it hurts. Each one explains how we treat it. Every visit starts with an assessment, and your physiotherapist examines you before recommending any treatment.</p>
          </div>
          <ul className="mt-8 flex flex-wrap gap-3" data-reveal="80">
            {BODY_AREAS.map((a) => (
              <li key={a.key}><Link href={services.some((x) => x.slug === a.service) ? `/services/${a.service}` : "/services"} className="chip state min-h-12 rounded-[var(--md-sys-shape-sm)] px-4 text-[0.9375rem] text-[var(--color-ink)] no-underline">{a.label}</Link></li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───── Team: clinical lead + physiotherapists, real portraits only ───── */}
      <section className="section" aria-labelledby="team-h">
        <div className="wrap">
          <div className="flex flex-wrap items-end justify-between gap-6" data-reveal>
            <div className="max-w-2xl">
              <p className="eyebrow">Our clinicians</p>
              <h2 id="team-h" className="headline-large mt-2">Meet the team who keeps you moving</h2>
              <p className="body-large mt-4 text-[var(--color-ink-muted)]">One-to-one care from clinicians who take the time to understand your goals — whether that&apos;s climbing stairs without pain or getting back on the field.</p>
            </div>
            <Link href="/team" className="link-arrow text-[var(--color-ink)]">View all profiles <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
          <ul className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-8 lg:grid-cols-3 lg:gap-y-12">
            {[
              { key: "lead", href: "/about#doctor-h", photo: "/images/team/dr-nitin-sunku.webp", name: ORTHO.name, role: "Orthopaedic & sports-medicine surgeon", tag: "Clinical lead" as string | null },
              ...team.map((t) => ({ key: t.id, href: `/team/${t.slug}`, photo: t.photo, name: t.displayName, role: t.designation, tag: null as string | null })),
            ].map((m, i) => (
              <li key={m.key} className={i === 0 ? "col-span-2 lg:col-span-1" : undefined} data-reveal={String(i * 80)}>
                <Link href={m.href} className="group flex h-full flex-col no-underline">
                  <span className={`relative block overflow-hidden rounded-[var(--md-sys-shape-lg)] ${i === 0 ? "aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/5]" : "aspect-[4/5]"} bg-[var(--md-sys-color-surface-container)] shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_24px_-12px_rgb(0_0_0/0.18)]`}>
                    {m.photo ? (
                      <Image src={m.photo} alt={`${m.name}, ${m.role}`} fill sizes={i === 0 ? "(min-width: 1024px) 33vw, 100vw" : "(min-width: 1024px) 33vw, 50vw"} className="object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
                    ) : (
                      <span className="font-display absolute inset-0 grid place-items-center text-[5rem] leading-none text-[var(--md-sys-color-on-secondary-container)]" aria-hidden="true">{m.name.replace(/^Dr\.? /, "").split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
                    )}
                    {m.tag ? <span className="absolute bottom-4 left-4 rounded-full bg-white/90 px-3 py-1.5 text-[0.6875rem] font-semibold tracking-[0.12em] text-[var(--color-ink)] uppercase backdrop-blur-sm" aria-hidden="true">{m.tag}</span> : null}
                  </span>
                  <span className="headline-small mt-4 text-[1.1875rem] text-[var(--color-ink)] sm:mt-5 sm:text-[1.5rem]">{m.name}</span>
                  <span className="body-medium mt-1 text-[var(--color-ink-muted)]">{m.role}</span>
                  <span className="title-small mt-4 inline-flex items-center gap-1.5 text-[var(--md-sys-color-primary)]">View profile <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───── Clinic card (band panel + curved media) ───── */}
      <section className="pb-[clamp(4rem,8vw,7rem)]" aria-labelledby="clinic-h">
        <div className="wrap">
          <div className="grid overflow-hidden rounded-l-[var(--md-sys-shape-xl)] md:grid-cols-2" data-reveal>
            <div className="band on-band flex flex-col justify-center gap-5 p-10 sm:p-14">
              <h2 id="clinic-h" className="headline-large">Designed for your recovery</h2>
              <p className="body-large muted">A treatment space with room to move, train and recover — on 24th Main Road, HSR Layout.</p>
              {hours.length ? <p className="body-medium">{hoursSummary(hours)}</p> : null}
              <div className="flex flex-wrap gap-3 pt-2">
                <Link href="/contact#visit" className="btn btn-on-band">Hours &amp; directions</Link>
                {phone ? <a href={telHref(phone)} className="btn btn-ghost-light"><Phone size={18} aria-hidden="true" /> {displayPhone(phone)}</a> : null}
              </div>
            </div>
            <figure className="relative m-0">
              <MediaPanel icon="Dumbbell" index={1} src="/images/stock/pain-in3.webp" alt="A physiotherapist treating a patient's neck in a treatment room" sizes="(min-width: 768px) 50vw, 100vw" className="curve-br h-full min-h-[22rem]" />
              <figcaption className="body-small absolute top-3 right-3 rounded-[var(--md-sys-shape-sm)] bg-black/55 px-2 py-1 text-white">Illustrative photo</figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ───── Numbers. Dr Sunku's figures are from drnitinsunkuortho.com (his own site);
             the rest come from the DB. No invented clinic outcome claims. ───── */}
      <section className="section bg-[var(--md-sys-color-surface-container)]" aria-labelledby="num-h">
        <div className="wrap grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-20">
          <div data-reveal>
            <span className="brand-rule" aria-hidden="true"><i /><i /><i /></span>
            <p className="eyebrow mt-5">Surgeon-led physiotherapy</p>
            <h2 id="num-h" className="headline-large mt-3">Your recovery, backed by an orthopaedic surgeon</h2>
            <p className="body-large mt-5 text-[var(--color-ink-muted)]">
              Physio Central runs under the clinical direction of {ORTHO.name}. Your rehab plan follows the diagnosis, and if
              something needs a surgeon&apos;s eye, you&apos;re one referral away, not starting over somewhere new.
            </p>
            <Link href="/about" className="link-arrow mt-7 inline-flex text-[var(--md-sys-color-primary)]">Meet Dr Sunku <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-12">
            {[
              { n: "10", suf: "+", l: "years in orthopaedics & sports medicine", note: "Dr Sunku's clinical experience" },
              { n: "10K", suf: "+", l: "patients consulted", note: "by Dr Sunku across his practice" },
              { n: String(sessionMins), suf: " min", l: "one-to-one, every visit", note: "never a shared or group session" },
              { n: String(openDays || 6), suf: " days", l: openDays === 7 ? "a week, Sunday mornings included" : "a week, morning and evening", note: hours.length ? hoursSummary(hours) : "call for today's hours" },
            ].map((x, i) => (
              <div key={x.l} className="border-t-[3px] pt-6" style={{ borderColor: `var(--brand-logo-${["blue", "green", "orange", "blue"][i]})` }} data-reveal={String(i * 80)}>
                <dt className="sr-only">{x.l}</dt>
                <dd className="m-0">
                  <span className="font-display block text-[clamp(3rem,6vw,4.25rem)] leading-none text-[var(--color-ink)]">
                    {x.n}{x.suf === "+"
                      ? <span className="ml-0.5 align-[0.45em] text-[0.55em] text-[var(--md-sys-color-primary)]">+</span>
                      : <span className="ml-2 text-[0.4em] text-[var(--color-ink-muted)]">{x.suf.trim()}</span>}
                  </span>
                  <span className="title-medium mt-3 block text-[var(--color-ink)]">{x.l}</span>
                  <span className="body-small mt-1 block text-[var(--color-ink-muted)]">{x.note}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ───── FAQ (M3 list) ───── */}
      <section className="section" aria-labelledby="faq-h">
        <div className="wrap grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div data-reveal>
            <h2 id="faq-h" className="headline-large">Questions, answered</h2>
            <p className="body-large mt-4 text-[var(--color-ink-muted)]">Can&apos;t find what you need? Call the clinic — we&apos;re happy to help.</p>
          </div>
          <div className="divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]" data-reveal="80">
            {[
              ["Is my online request a confirmed booking?", `Not yet. Your request is pending until the clinic confirms it — usually ${response}. You'll get a reference number straight away, and a private link to check the status.`],
              ["Do I need to create an account?", "No. Just your name and a phone number. Detailed medical history is collected securely later, not on the booking form."],
              ["How will I know what it costs?", "Fees are shown where published. Where a fee depends on your assessment, you'll get an itemised estimate to accept first, and any extra item needs your approval on the new total."],
              ["Can I cancel or change my appointment?", "Yes — cancel from your private link, or call the clinic to reschedule."],
              ["Is my information kept private?", "We only ask for what's needed to arrange your care, and your status page is visible only through your private link. See our privacy notice for details."],
            ].map(([q, a]) => (
              <details key={q} className="faq group">
                <summary className="state flex min-h-16 items-center justify-between gap-4 rounded-[var(--md-sys-shape-sm)] px-2 py-4">
                  <span className="title-large">{q}</span>
                  <span className="faq-icon grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--md-sys-color-primary)]"><Plus size={22} aria-hidden="true" /></span>
                </summary>
                <p className="body-large px-2 pb-6 text-[var(--color-ink-muted)]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ───── Booking CTA ───── */}
      <section className="pb-[clamp(4rem,8vw,7rem)]">
        <div className="wrap">
          <div className="band on-band flex flex-wrap items-center justify-between gap-8 rounded-[var(--md-sys-shape-xl)] p-10 sm:p-14" data-reveal>
            <div className="max-w-xl">
              <h2 className="headline-large">Start your recovery this week</h2>
              <p className="body-large muted mt-3">Pick a time online, or call and we&apos;ll find one together.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/book" className="btn btn-on-band">Request appointment</Link>
              {phone ? <a href={telHref(phone)} className="btn btn-ghost-light"><Phone size={18} aria-hidden="true" /> Call {displayPhone(phone)}</a> : null}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
