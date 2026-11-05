import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardCheck, MessageSquareText, Dumbbell, Repeat, ArrowUpRight, ArrowRight, GraduationCap, Briefcase, BookOpen, Users,
  ShieldCheck, ReceiptText, UserRound, House, Scissors, HeartPulse, Send, MapPin,
} from "lucide-react";
import { getOpeningHours, getPublicBranches, getPublicClinic, getPublicServices } from "@/modules/content/public";
import { dayHours } from "@/lib/format";
import { PageHero } from "@/components/site/page-hero";
import { MediaPanel } from "@/components/site/media";
import { BODY_AREAS } from "@/components/site/body-areas";
import { ORTHO } from "@/components/site/ortho-referral";
import { pageOpenGraph } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "About",
  description:
    "Physio Central in HSR Layout, Bengaluru is a surgeon-led physiotherapy clinic under orthopaedic and sports-medicine surgeon Dr Nitin N Sunku.",
  alternates: { canonical: "/about" },
  openGraph: pageOpenGraph("/about"),
};

/*
 * Every fact about Dr Sunku below is taken from his own practice site
 * (drnitinsunkuortho.com: home, /about and /awards, checked 2026-11-03).
 * Do not add figures or honours that aren't published there.
 */
const CREDENTIALS = [
  {
    icon: GraduationCap, title: "Education & training",
    items: [
      "MBBS, Rajarajeshwari Medical College & Hospital",
      "MS Orthopaedics (Gold Medalist), Bangalore Medical College & Research Institute",
      "Fellowship training in Arthroscopy, Joint Replacement & Sports Medicine",
      "Registered with the Karnataka Medical Council, Reg. No. 117608",
    ],
  },
  {
    icon: Briefcase, title: "Clinical roles",
    items: [
      "Team Doctor, Bengaluru Football Club",
      "Consultant, Raghava Multispeciality Hospital, Attibele",
      "Consultant, Health Nest Hospital, HSR Layout",
      "Visiting consultant, Narayana Hrudayalaya and Manipal Hospital",
    ],
  },
  {
    icon: BookOpen, title: "Teaching & publications",
    items: [
      "Chapter contributor, Atlas of Arthroscopy (Springer): “Ideal Tibial Tunnel Location & Correcting Errors”",
      "Faculty, SIMGLOBE 2026: arthroscopic simulation workshop",
      "Co-surgeon, live transosseous repair, Bangalore Shoulder Summit 2026",
    ],
  },
  {
    icon: Users, title: "Professional memberships",
    items: ["ISAKOS", "ISKSAA", "AO Trauma"],
  },
] as const;

const EXPERTISE = [
  "Sports injuries, ACL and meniscus tears",
  "Arthroscopic (keyhole) knee and shoulder surgery",
  "Knee and hip replacement",
  "Shoulder and rotator cuff problems",
  "Fractures and trauma",
  "Arthritis and degenerative joint conditions",
  "PRP, GFC and ultrasound-guided injections",
];

const SURGEON_LED = [
  { icon: HeartPulse, title: "Before surgery", body: "If an operation is planned, ‘prehab’ builds strength and range of movement first, which makes the recovery after surgery easier.", tone: "secondary" },
  { icon: Scissors, title: "After surgery", body: "Rehabilitation after ACL reconstruction, arthroscopy, or knee and hip replacement follows the operating surgeon's protocol: what to load, when, and how far.", tone: "tertiary" },
  { icon: Send, title: "When physio isn't enough", body: "If progress stalls or something doesn't add up, your physiotherapist can refer you for an orthopaedic opinion, with your notes going along.", tone: "primary" },
] as const;

const STEPS = [
  { icon: ClipboardCheck, title: "Assess", body: "A first visit focused on your history, how you move, and what you want to get back to. We test strength, range and the movements that hurt.", tone: "secondary" },
  { icon: MessageSquareText, title: "Explain & agree", body: "Findings in plain words, then a plan — number of sessions, home exercises and an itemised fee — that you agree to before treatment starts.", tone: "tertiary" },
  { icon: Dumbbell, title: "Treat & strengthen", body: "Hands-on care to settle pain, then progressive strength and movement work so the improvement holds up in daily life and sport.", tone: "primary" },
  { icon: Repeat, title: "Stay well", body: "A home programme you can keep doing, checked and updated at each visit, so you're not dependent on the clinic once you're better.", tone: "secondary" },
] as const;

export default async function AboutPage() {
  const [clinic, branches, services] = await Promise.all([getPublicClinic(), getPublicBranches(), getPublicServices()]);
  const branch = branches[0];
  const hours = branch ? await getOpeningHours(branch.id) : [];
  const sessionMins = services.find((s) => s.bookable && !/assess/i.test(s.slug))?.durationMinutes ?? 45;
  const response = branch?.responseWindow ?? "within one working day";
  const name = clinic?.tradeName ?? "Physio Central";

  const commitments = [
    { icon: UserRound, title: "One-to-one, every time", body: `${sessionMins} minutes with your physiotherapist. Never a shared or group session.` },
    { icon: ReceiptText, title: "Fees agreed first", body: "An itemised estimate before treatment starts, and nothing extra is added without your approval." },
    { icon: ShieldCheck, title: "Your information stays private", body: "We only ask for what's needed to arrange your care. Medical history is collected securely, not on the booking form." },
    { icon: House, title: "Home visits", body: "When travelling isn't possible yet, after surgery or for older patients. Arranged by phone." },
  ];

  return (
    <>
      <PageHero
        eyebrow="About us"
        title={`About ${name}`}
        lead="A physiotherapy clinic in HSR Layout, run under the clinical direction of an orthopaedic and sports-medicine surgeon, so your rehab plan and your diagnosis stay joined up."
      >
        <Link href="/book" className="btn btn-primary">Request appointment</Link>
        <a href="#doctor-h" className="btn btn-secondary">Meet Dr Sunku</a>
      </PageHero>

      {/* ───── Story ───── */}
      <section className="wrap section grid items-center gap-12 lg:grid-cols-2 lg:gap-16" aria-labelledby="story-h">
        <div data-reveal>
          <p className="eyebrow">Why we exist</p>
          <h2 id="story-h" className="headline-large mt-2">Physiotherapy with a surgeon&apos;s eye</h2>
          <div className="prose-clinic body-large mt-6 space-y-4 text-[var(--color-ink-muted)]">
            <p>
              Most people with a sore knee, back or shoulder see a doctor in one place and a physiotherapist somewhere else,
              and the two rarely talk. Plans drift, exercises get repeated or skipped, and it&apos;s hard to know whether
              things are actually on track.
            </p>
            <p>
              {name} closes that gap. Treatment here is planned around an orthopaedic understanding of the problem: what
              structure is involved, what it can safely take, and how it heals. Whether you&apos;re recovering from surgery,
              an injury or a long-standing ache, the goal is the same: settle the pain, rebuild strength, and get you back
              to what you want to do.
            </p>
          </div>
        </div>
        <figure className="relative m-0" data-reveal="80">
          <MediaPanel icon="Dumbbell" index={1} src="/images/stock/clinic-in.webp" alt="A woman doing a floor exercise on a mat" sizes="(min-width: 1024px) 50vw, 100vw" className="curve-br aspect-[4/3]" />
          <figcaption className="body-small absolute top-3 right-3 rounded-[var(--md-sys-shape-sm)] bg-black/55 px-2 py-1 text-white">Illustrative photo</figcaption>
        </figure>
      </section>

      {/* ───── Dr Sunku ───── */}
      <section className="bg-[var(--md-sys-color-surface-container-low)]" aria-labelledby="doctor-h">
        <div className="wrap section">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div data-reveal>
              <p className="eyebrow">Clinical lead</p>
              <h2 id="doctor-h" className="headline-large mt-2 scroll-mt-28">{ORTHO.name}</h2>
              <p className="title-medium mt-2 text-[var(--color-ink-muted)]">Consultant orthopaedic surgeon · Arthroscopy, sports medicine &amp; joint replacement</p>
              <p className="body-small mt-1 text-[var(--color-ink-muted)]">{ORTHO.registration}</p>
              <div className="prose-clinic body-large mt-6 space-y-4">
                <p>
                  Dr Nitin Sunku is a fellowship-trained orthopaedic surgeon with more than 10 years of focused orthopaedic
                  experience. He trained at Bangalore Medical College &amp; Research Institute, where he completed his MS in
                  Orthopaedics as a gold medalist, followed by fellowship training in arthroscopy, joint replacement and
                  sports medicine.
                </p>
                <p>
                  He is Team Doctor for Bengaluru Football Club, so returning athletes safely to play is everyday work for
                  him. His approach is conservative first: non-surgical treatment, physiotherapy and guided injections come
                  before surgery, and when an operation is needed he favours minimally invasive, keyhole techniques that
                  shorten recovery.
                </p>
              </div>
              <h3 className="title-medium mt-8">Areas of expertise</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {EXPERTISE.map((e) => <li key={e} className="chip">{e}</li>)}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={ORTHO.url} target="_blank" rel="noopener" className="btn btn-tonal">Orthopaedic practice website <ArrowUpRight size={16} aria-hidden="true" /></a>
                <a href={ORTHO.phoneHref} className="btn btn-secondary">Ortho queries: {ORTHO.phone}</a>
              </div>
            </div>
            <ul className="grid gap-5 sm:grid-cols-2">
              {CREDENTIALS.map((c, i) => (
                <li key={c.title} className="card" data-reveal={String(i * 80)}>
                  <c.icon size={24} strokeWidth={1.6} aria-hidden="true" className="text-[var(--md-sys-color-primary)]" />
                  <h3 className="title-medium mt-3">{c.title}</h3>
                  <ul className="body-medium mt-2 space-y-2 text-[var(--color-ink-muted)]">
                    {c.items.map((it) => <li key={it} className="flex gap-2"><span aria-hidden="true" className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--md-sys-color-tertiary)]" />{it}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ───── Surgeon-led ───── */}
      <section className="wrap section" aria-labelledby="led-h">
        <div className="max-w-3xl" data-reveal>
          <p className="eyebrow">What &quot;surgeon-led&quot; means for you</p>
          <h2 id="led-h" className="headline-large mt-2">One plan, from diagnosis to full recovery</h2>
        </div>
        <ul className="mt-12 grid gap-10 md:grid-cols-3">
          {SURGEON_LED.map((s, i) => (
            <li key={s.title} data-reveal={String(i * 80)}>
              <span className="grid h-14 w-14 place-items-center rounded-[var(--md-sys-shape-lg)]" style={{ background: `var(--md-sys-color-${s.tone}-container)`, color: `var(--md-sys-color-on-${s.tone}-container)` }}><s.icon size={26} strokeWidth={1.6} aria-hidden="true" /></span>
              <h3 className="headline-small mt-5">{s.title}</h3>
              <p className="body-medium mt-2 text-[var(--color-ink-muted)]">{s.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ───── What we help with ───── */}
      <section className="band on-band section" aria-labelledby="help-h">
        <div className="wrap">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-end" data-reveal>
            <h2 id="help-h" className="headline-large">What we help with</h2>
            <p className="body-large muted">Not sure where your problem fits? Book an assessment. Your physiotherapist will work out the right plan with you.</p>
          </div>
          <ul className="mt-12 grid gap-px overflow-hidden rounded-[var(--md-sys-shape-lg)] bg-white/15 sm:grid-cols-2 lg:grid-cols-4">
            {BODY_AREAS.map((a, i) => (
              <li key={a.key} className="bg-[var(--md-sys-color-inverse-surface)] p-6" data-reveal={String((i % 4) * 60)}>
                <p className="title-medium text-white">{a.label}</p>
                <p className="body-small muted mt-1">{a.examples}</p>
              </li>
            ))}
          </ul>
          <Link href="/services" className="btn btn-on-band mt-10">See all services <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>

      {/* ───── Approach ───── */}
      <section className="wrap section" aria-labelledby="approach-h">
        <h2 id="approach-h" className="headline-large" data-reveal>How treatment works</h2>
        <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} data-reveal={String(i * 80)}>
              <div className="flex items-center gap-3">
                <span className="grid h-14 w-14 place-items-center rounded-[var(--md-sys-shape-lg)]" style={{ background: `var(--md-sys-color-${s.tone}-container)`, color: `var(--md-sys-color-on-${s.tone}-container)` }}><s.icon size={26} strokeWidth={1.6} aria-hidden="true" /></span>
                <span className="label-large text-[var(--color-ink-muted)]">Step {i + 1}</span>
              </div>
              <h3 className="headline-small mt-5">{s.title}</h3>
              <p className="body-medium mt-2 text-[var(--color-ink-muted)]">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ───── Commitments ───── */}
      <section className="bg-[var(--md-sys-color-surface-container)]" aria-labelledby="promise-h">
        <div className="wrap section">
          <h2 id="promise-h" className="headline-large" data-reveal>Our commitments to you</h2>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {commitments.map((c, i) => (
              <li key={c.title} className="card" data-reveal={String(i * 80)}>
                <c.icon size={24} strokeWidth={1.6} aria-hidden="true" className="text-[var(--md-sys-color-primary)]" />
                <h3 className="title-medium mt-3">{c.title}</h3>
                <p className="body-medium mt-1 text-[var(--color-ink-muted)]">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───── Visit + CTA ───── */}
      <section className="wrap section grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center" aria-labelledby="cta-h">
        <div data-reveal>
          <h2 id="cta-h" className="headline-large">Ready to start?</h2>
          <p className="body-large mt-4 max-w-xl text-[var(--color-ink-muted)]">
            Request an appointment online in about two minutes. We&apos;ll confirm a time {response}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/book" className="btn btn-primary">Request appointment</Link>
            <Link href="/contact" className="btn btn-secondary">Contact &amp; directions</Link>
          </div>
        </div>
        {branch?.addressVerified ? (
          <div className="card-filled" data-reveal="80">
            <p className="title-medium flex items-center gap-2"><MapPin size={18} aria-hidden="true" /> {branch.name}</p>
            <address className="body-medium mt-2 not-italic text-[var(--color-ink-muted)]">{[branch.addressLine, branch.locality, branch.city, branch.postalCode].filter(Boolean).join(", ")}</address>
            {hours.length ? <p className="body-medium mt-3">Mon–Sat · {dayHours(hours, 1)}</p> : null}
            <Link href="/contact#visit" className="link-arrow mt-4 inline-flex text-[var(--md-sys-color-primary)]">Map &amp; hours <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        ) : null}
      </section>
    </>
  );
}
