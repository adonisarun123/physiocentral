import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight, ArrowUpRight, Clock, ShieldCheck, UserRound, CalendarCheck, MapPin, Phone, Plus, Send,
  ClipboardCheck, Stethoscope, Repeat, Lock, Accessibility as AccessIcon, ListChecks,
} from "lucide-react";
import { getOpeningHours, getPublicBranches, getPublicClinic, getPublicServices, getPublicTherapists } from "@/modules/content/public";
import { JsonLd, clinicJsonLd } from "@/modules/content/schema";
import { formatINR } from "@/modules/billing/money";
import { WEEKDAYS, telHref, displayPhone } from "@/lib/format";
import { BODY_AREAS } from "@/components/site/body-areas";
import { Icon, iconForCategory } from "@/components/site/icon";
import { AssessmentMock, EstimateMock, StatusMock } from "@/components/site/mocks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };

const ACCENTS = [
  { bg: "bg-[var(--color-brand-soft)]", fg: "text-[var(--color-brand)]", ring: "group-hover:bg-[var(--color-logo-blue)]" },
  { bg: "bg-[var(--color-green-soft)]", fg: "text-[var(--color-green)]", ring: "group-hover:bg-[var(--color-logo-green)]" },
  { bg: "bg-[var(--color-orange-soft)]", fg: "text-[var(--color-orange)]", ring: "group-hover:bg-[var(--color-logo-orange)]" },
];

const MARQUEE = ["Joint pain & arthritis", "Fractures", "TKR & THR rehab", "Arthroscopy rehab", "Ligament & muscle injuries", "Neck & back pain", "Sciatica", "Posture care", "Mobility & balance", "Manual therapy", "Electrotherapy", "Home visits"];

function SectionHead({ eyebrow, title, lead, center }: { eyebrow: string; title: React.ReactNode; lead?: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"} data-reveal>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="display mt-5 text-[2.1rem] sm:text-[3rem]">{title}</h2>
      {lead ? <p className={`mt-4 text-lg text-[var(--color-ink-muted)] ${center ? "mx-auto max-w-2xl" : "max-w-2xl"}`}>{lead}</p> : null}
    </div>
  );
}

export default async function HomePage() {
  const [clinic, branches, services, team] = await Promise.all([getPublicClinic(), getPublicBranches(), getPublicServices(), getPublicTherapists()]);
  const branch = branches[0];
  const hours = branch ? await getOpeningHours(branch.id) : [];
  const name = clinic?.tradeName ?? "Physio Central";
  const verified = Boolean(clinic?.identityVerified && branch?.addressVerified);
  // Neighbourhood is safe to show before the full street address is verified.
  const place = [branch?.locality, branch?.city].filter(Boolean).join(", ") || null;
  const ld = clinic && branch ? clinicJsonLd(clinic, branch, services) : null;
  const response = branch?.responseWindow ?? "within one working day";
  const bookingOpen = services.some((s) => s.bookable);

  return (
    <>
      {ld ? <JsonLd data={ld} /> : null}

      {/* ───────── Hero ───────── */}
      <section className="aurora grid-dots relative -mt-px">
        <div className="glow-orange right-[30%] top-[55%]" aria-hidden="true" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:pt-20 lg:pb-24">
          <div data-reveal>
            <span className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" /> {bookingOpen ? "Online appointment requests open" : "Physiotherapy clinic"}{place ? ` · ${place}` : ""}</span>
            <h1 className="display mt-6 text-[2.9rem] sm:text-[4.2rem] lg:text-[4.9rem]">
              Physiotherapy that gets you <em>moving again.</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-[var(--color-ink-muted)] sm:text-xl">
              {name} starts with a proper assessment, explains what&apos;s going on in plain words, and agrees your plan — and its cost — with you before treatment begins.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/book" className="btn btn-primary px-7 py-3.5 text-base">Book an assessment <ArrowRight size={18} aria-hidden="true" /></Link>
              <Link href="#journey" className="btn btn-secondary px-6 py-3.5 text-base">How it works</Link>
            </div>
            <ul className="mt-10 grid max-w-xl grid-cols-2 gap-x-6 gap-y-3 text-[0.95rem] sm:grid-cols-2" aria-label="Good to know">
              <li className="flex items-center gap-2"><Clock size={18} className="text-[var(--color-brand)]" aria-hidden="true" /> Request in about 2 minutes</li>
              <li className="flex items-center gap-2"><UserRound size={18} className="text-[var(--color-green)]" aria-hidden="true" /> No account needed</li>
              <li className="flex items-center gap-2"><CalendarCheck size={18} className="text-[var(--color-orange)]" aria-hidden="true" /> Confirmed {response}</li>
              <li className="flex items-center gap-2"><ShieldCheck size={18} className="text-[var(--color-brand)]" aria-hidden="true" /> No surprise charges</li>
            </ul>
          </div>

          {/* Brand art: the runner mark on glass, with floating fact cards */}
          <div className="relative mx-auto w-full max-w-md" data-reveal="150" aria-hidden="true">
            <div className="glass relative aspect-[4/5] rounded-[2.5rem] p-10">
              <div className="absolute inset-6 rounded-[2rem] bg-gradient-to-br from-[#e8f2fe] via-white to-[#e7f6e6]" />
              <Image src="/brand/logo-mark.svg" alt="" fill unoptimized className="relative object-contain p-12" priority />
            </div>
            <div className="glass floaty absolute left-0 top-10 sm:-left-6 flex items-center gap-3 rounded-2xl px-4 py-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-brand)] text-white"><ClipboardCheck size={20} /></span>
              <span><span className="block text-xs text-[var(--color-ink-muted)]">Step one</span><span className="font-display font-bold">Assessment first</span></span>
            </div>
            <div className="glass floaty-slow absolute right-0 top-1/2 sm:-right-4 flex items-center gap-3 rounded-2xl px-4 py-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-logo-green)] text-white"><ListChecks size={20} /></span>
              <span><span className="block text-xs text-[var(--color-ink-muted)]">Your plan</span><span className="font-display font-bold">Agreed together</span></span>
            </div>
            <div className="glass floaty absolute -bottom-5 left-8 flex items-center gap-3 rounded-2xl px-4 py-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-logo-orange)] text-white"><ShieldCheck size={20} /></span>
              <span><span className="block text-xs text-[var(--color-ink-muted)]">Costs</span><span className="font-display font-bold">Approved by you</span></span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Marquee ───────── */}
      <section className="marquee overflow-hidden border-y border-[var(--color-line)] bg-white py-5" aria-label="Areas we help with">
        <ul className="sr-only">{MARQUEE.map((m) => <li key={m}>{m}</li>)}</ul>
        <div className="marquee-track" aria-hidden="true">
          {[...MARQUEE, ...MARQUEE].map((m, i) => (
            <span key={i} className="font-display flex items-center gap-6 px-6 text-xl font-bold text-[var(--color-ink)] sm:text-2xl">
              {m}
              <span className={`h-2.5 w-2.5 rounded-full ${["bg-[var(--color-logo-blue)]", "bg-[var(--color-logo-green)]", "bg-[var(--color-logo-orange)]"][i % 3]}`} />
            </span>
          ))}
        </div>
      </section>

      {/* ───────── Where it hurts ───────── */}
      <section className="bg-[var(--color-surface-alt)]" aria-labelledby="hurt-h">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHead eyebrow="Start here" title={<span id="hurt-h">Tell us <em>where it hurts</em></span>} lead="Pick an area to request an assessment. Your physiotherapist examines you in person before recommending any treatment." />
            <Link href="/book" className="btn btn-dark" data-reveal>Not sure? Book an assessment <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BODY_AREAS.map((a, i) => {
              const ac = ACCENTS[i % 3];
              return (
                <li key={a.key} data-reveal={String((i % 4) * 70)}>
                  <Link href="/book" className="card card-hover group flex h-full flex-col gap-4 no-underline">
                    <span className={`grid h-12 w-12 place-items-center rounded-2xl ${ac.bg} ${ac.fg} transition-colors ${ac.ring} group-hover:text-white`}><Icon name={a.icon} size={24} /></span>
                    <span className="font-display text-lg font-bold text-[var(--color-ink)]">{a.label}</span>
                    <span className="text-[0.95rem] text-[var(--color-ink-muted)]">{a.examples}</span>
                    <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-brand)]">Request assessment <ArrowUpRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ───────── Bento: why us ───────── */}
      <section aria-labelledby="why-h">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <SectionHead center eyebrow="Why Physio Central" title={<span id="why-h">Care that&apos;s <em>clear at every step</em></span>} lead="No guesswork, no surprise bills, no chasing for updates." />
          <div className="mt-14 grid gap-4 md:grid-cols-6 md:grid-rows-[auto_auto]">
            <article className="card relative overflow-hidden md:col-span-4 md:row-span-1 lg:p-8" data-reveal>
              <div className="grid items-center gap-8 sm:grid-cols-2">
                <div>
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]"><Stethoscope size={24} aria-hidden="true" /></span>
                  <h3 className="font-display mt-5 text-2xl font-extrabold tracking-tight">Assessment first, not guesswork</h3>
                  <p className="mt-3 text-[var(--color-ink-muted)]">Your first visit is about understanding you — history, goals and how you move — so treatment targets the cause, not just the symptom.</p>
                </div>
                <div className="flex justify-center rounded-3xl bg-gradient-to-br from-[#e8f2fe] to-[#f4f7fb] p-6"><AssessmentMock /></div>
              </div>
            </article>
            <article className="relative overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-ink)] p-7 text-white md:col-span-2" data-reveal="100">
              <div className="glow-orange -right-20 -top-20" aria-hidden="true" />
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-[#ff9a52]"><ShieldCheck size={24} aria-hidden="true" /></span>
              <h3 className="font-display mt-5 text-2xl font-extrabold tracking-tight">Costs you approve</h3>
              <p className="mt-3 text-white/80">You see an itemised estimate first. Anything extra needs your OK on the new total — before it&apos;s added.</p>
              <p className="font-display mt-6 text-6xl font-extrabold text-[#ff9a52]">0</p>
              <p className="text-sm text-white/75">surprise lines on your bill</p>
            </article>
            <article className="card md:col-span-2" data-reveal>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-green-soft)] text-[var(--color-green)]"><Send size={22} aria-hidden="true" /></span>
              <h3 className="font-display mt-5 text-xl font-extrabold tracking-tight">Request in 2 minutes</h3>
              <p className="mt-2 text-[var(--color-ink-muted)]">Pick a service and time, add your details — no account, no app.</p>
            </article>
            <article className="card md:col-span-2" data-reveal="80">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]"><Lock size={22} aria-hidden="true" /></span>
              <h3 className="font-display mt-5 text-xl font-extrabold tracking-tight">Your private status link</h3>
              <p className="mt-2 text-[var(--color-ink-muted)]">Check your request, review estimates or cancel — from a link only you have.</p>
            </article>
            <article className="card md:col-span-2" data-reveal="160">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-orange-soft)] text-[var(--color-orange)]"><AccessIcon size={22} aria-hidden="true" /></span>
              <h3 className="font-display mt-5 text-xl font-extrabold tracking-tight">Tell us what you need</h3>
              <p className="mt-2 text-[var(--color-ink-muted)]">Mention access or assistance needs when you book and we&apos;ll plan around them.</p>
            </article>
          </div>
        </div>
      </section>

      {/* ───────── Journey timeline ───────── */}
      <section id="journey" className="scroll-mt-24 bg-[var(--color-surface-alt)]" aria-labelledby="journey-h">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <SectionHead eyebrow="How it works" title={<span id="journey-h">Your path from <em>pain to progress</em></span>} />
          <div className="relative mt-14">
          <div className="absolute left-6 right-6 top-6 hidden h-0.5 bg-gradient-to-r from-[#0079f4] via-[#159c11] to-[#f06200] md:block" aria-hidden="true" />
          <ol className="relative grid gap-6 md:grid-cols-4">
            {[
              { icon: Send, title: "Send a request", body: "Choose a service, therapist (or any) and a preferred time.", tone: "bg-[var(--color-logo-blue)]" },
              { icon: CalendarCheck, title: "We confirm", body: `The clinic confirms or suggests a better time ${response}.`, tone: "bg-[#0b6fc0]" },
              { icon: ClipboardCheck, title: "Assess & plan", body: "A thorough assessment, then a plan and estimate you approve.", tone: "bg-[var(--color-logo-green)]" },
              { icon: Repeat, title: "Treat & progress", body: "Sessions and exercises that build towards your goals.", tone: "bg-[var(--color-logo-orange)]" },
            ].map((s, i) => (
              <li key={s.title} className="relative" data-reveal={String(i * 100)}>
                <span className={`relative grid h-12 w-12 place-items-center rounded-full ${s.tone} text-white shadow-lg ring-8 ring-[var(--color-surface-alt)]`}><s.icon size={22} aria-hidden="true" /></span>
                <p className="mt-5 text-sm font-bold uppercase tracking-widest text-[var(--color-ink-muted)]">Step {i + 1}</p>
                <h3 className="font-display mt-1 text-xl font-extrabold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-[var(--color-ink-muted)]">{s.body}</p>
              </li>
            ))}
          </ol>
          </div>
          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            <div className="card flex flex-col items-center gap-6 rounded-3xl bg-gradient-to-br from-[#e7f6e6] to-white p-8 sm:flex-row" data-reveal>
              <EstimateMock />
              <p className="text-[var(--color-ink-muted)]"><strong className="font-display block text-xl text-[var(--color-ink)]">Every cost, itemised.</strong> Accept or decline the exact estimate online — a changed amount always needs a fresh approval.</p>
            </div>
            <div className="card flex flex-col items-center gap-6 rounded-3xl bg-gradient-to-br from-[#e8f2fe] to-white p-8 sm:flex-row" data-reveal="120">
              <StatusMock />
              <p className="text-[var(--color-ink-muted)]"><strong className="font-display block text-xl text-[var(--color-ink)]">Always know where you stand.</strong> Your reference and private link show when your appointment is confirmed.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Services ───────── */}
      <section aria-labelledby="svc-h">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHead eyebrow="Treatments" title={<span id="svc-h">What we <em>can help with</em></span>} />
            {services.length ? <Link href="/services" className="btn btn-secondary" data-reveal>All services <ArrowRight size={16} aria-hidden="true" /></Link> : null}
          </div>
          {services.length === 0 ? (
            <div className="card mt-10 max-w-2xl" data-reveal>
              <p className="font-display text-lg font-bold">Service details are being reviewed by our clinical lead.</p>
              <p className="mt-1 text-[var(--color-ink-muted)]">They&apos;ll appear here shortly. Meanwhile, request an assessment or call — we&apos;ll guide you to the right care.</p>
            </div>
          ) : (
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.slice(0, 9).map((s, i) => {
                const ac = ACCENTS[i % 3];
                return (
                  <li key={s.id} data-reveal={String((i % 3) * 80)}>
                    <Link href={`/services/${s.slug}`} className="card card-hover group flex h-full flex-col gap-4 no-underline">
                      <div className="flex items-start justify-between">
                        <span className={`grid h-12 w-12 place-items-center rounded-2xl ${ac.bg} ${ac.fg}`}><Icon name={iconForCategory(s.category)} size={24} /></span>
                        <ArrowUpRight size={22} className="text-[var(--color-ink-muted)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--color-brand)]" aria-hidden="true" />
                      </div>
                      <span className="font-display text-xl font-extrabold tracking-tight text-[var(--color-ink)]">{s.name}</span>
                      {s.summary ? <span className="text-[var(--color-ink-muted)]">{s.summary}</span> : null}
                      <span className="mt-auto flex flex-wrap gap-2 pt-2 text-sm">
                        {s.bookable ? <span className="chip">{s.durationMinutes} min</span> : null}
                        <span className="chip">{s.pricePaise ? formatINR(s.pricePaise) : "Fee after assessment"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ───────── Team ───────── */}
      {team.length ? (
        <section className="bg-[var(--color-surface-alt)]" aria-labelledby="team-h">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
            <SectionHead eyebrow="Our team" title={<span id="team-h">Who will <em>look after you</em></span>} />
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {team.map((t, i) => (
                <li key={t.id} data-reveal={String((i % 3) * 80)}>
                  <Link href={`/team/${t.slug}`} className="card card-hover flex items-center gap-4 no-underline">
                    <span className={`font-display grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-xl font-extrabold text-white ${["bg-[var(--color-brand)]", "bg-[var(--color-green)]", "bg-[var(--color-orange)]"][i % 3]}`} aria-hidden="true">
                      {t.displayName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                    </span>
                    <span>
                      <span className="font-display block text-lg font-extrabold text-[var(--color-ink)]">{t.displayName}</span>
                      <span className="block text-sm text-[var(--color-ink-muted)]">{t.designation}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ───────── Visit (dark) ───────── */}
      <section className="aurora relative bg-[var(--color-ink)] text-white" aria-labelledby="visit-h">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2">
          <div data-reveal>
            <span className="eyebrow !border-white/20 !bg-white/10 !text-white"><MapPin size={15} aria-hidden="true" /> Visit us</span>
            <h2 id="visit-h" className="display mt-5 text-[2.1rem] !text-white sm:text-[3rem]">Easy to reach, <span className="text-[#7dc0ff]">easy to book.</span></h2>
            {verified && branch ? (
              <address className="mt-5 text-lg not-italic text-white/85">{[branch.addressLine, branch.locality, branch.city].filter(Boolean).join(", ")}</address>
            ) : (
              <p className="mt-5 text-lg text-white/80">Our address, map and parking details are being confirmed and will appear here soon.</p>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/locations/main" className="btn btn-primary">Hours &amp; directions <ArrowRight size={16} aria-hidden="true" /></Link>
              {branch?.phone ? <a href={telHref(branch.phone)} className="btn btn-ghost-light"><Phone size={16} aria-hidden="true" /> {displayPhone(branch.phone)}</a> : null}
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur" data-reveal="120">
            <p className="font-display text-xl font-extrabold">Opening hours</p>
            {hours.length === 0 ? (
              <p className="mt-3 text-white/80">Hours will be published soon. Call us to check availability.</p>
            ) : (
              <dl className="mt-4 divide-y divide-white/10">
                {WEEKDAYS.map((d, i) => {
                  const h = hours.find((x) => x.weekday === i);
                  return (
                    <div key={d} className="flex justify-between py-2.5">
                      <dt className="text-white/80">{d}</dt>
                      <dd className={h ? "font-semibold" : "text-white/60"}>{h ? `${h.opens} – ${h.closes}` : "Closed"}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </div>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section aria-labelledby="faq-h">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHead eyebrow="FAQ" title={<span id="faq-h">Questions, <em>answered</em></span>} lead="Can't find what you need? Call the clinic — we're happy to help." />
          <div className="space-y-3" data-reveal="100">
            {[
              ["Is my online request a confirmed booking?", `Not yet. Your request is pending until the clinic confirms it — usually ${response}. You'll get a reference number straight away, and a private link to check the status.`],
              ["Do I need to create an account?", "No. Just your name and a phone number. Detailed medical history is collected securely later, not on the booking form."],
              ["How will I know what it costs?", "Fees are shown where published. Where a fee depends on your assessment, you'll get an itemised estimate to accept first, and any extra item needs your approval on the new total."],
              ["Can I cancel or change my appointment?", "Yes — cancel from your private link, or call the clinic to reschedule."],
              ["Is my information kept private?", "We only ask for what's needed to arrange your care, and your status page is visible only through your private link. See our privacy notice for details."],
            ].map(([q, a]) => (
              <details key={q} className="faq card group !p-0">
                <summary className="flex items-center justify-between gap-4 px-6 py-5">
                  <span className="font-display text-lg font-bold">{q}</span>
                  <span className="faq-icon grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-brand-soft)] text-[var(--color-brand)]"><Plus size={18} aria-hidden="true" /></span>
                </summary>
                <p className="px-6 pb-6 text-[var(--color-ink-muted)]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Final CTA ───────── */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#0052ad] via-[#0066d6] to-[#0b6a3a] px-6 py-16 text-white sm:px-14 sm:py-20" data-reveal>
          <Image src="/brand/logo-mark.svg" alt="" width={360} height={440} unoptimized className="pointer-events-none absolute -right-10 -bottom-16 hidden opacity-20 mix-blend-luminosity md:block" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <h2 className="font-display text-[2.2rem] font-extrabold leading-[1.05] tracking-tight sm:text-[3.2rem]">Ready to start feeling better?</h2>
            <p className="mt-5 text-lg text-white/90">Send a request in two minutes. We&apos;ll confirm a time {response} — your request is pending until the clinic confirms it.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/book" className="btn bg-white px-7 py-3.5 text-base text-[var(--color-brand-strong)] hover:bg-white/90">Book an assessment <ArrowRight size={18} aria-hidden="true" /></Link>
              {branch?.phone ? <a href={telHref(branch.phone)} className="btn btn-ghost-light px-6 py-3.5 text-base"><Phone size={18} aria-hidden="true" /> Call the clinic</a> : null}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
