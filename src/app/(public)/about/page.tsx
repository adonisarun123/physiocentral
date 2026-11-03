import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, MessageSquareText, Dumbbell, ArrowUpRight, GraduationCap, Trophy, Hospital, Activity } from "lucide-react";
import { getPublicClinic } from "@/modules/content/public";
import { PageHero } from "@/components/site/page-hero";
import { ORTHO } from "@/components/site/ortho-referral";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "About",
  description: "Physio Central is led by Dr Nitin N Sunku, a fellowship-trained orthopaedic and sports-medicine surgeon in Bengaluru.",
  alternates: { canonical: "/about" },
};

// Source: drnitinsunkuortho.com (Dr Sunku's own practice site), checked 2026-11-03.
const FACTS = [
  { icon: GraduationCap, title: "Training", body: "MBBS and MS Orthopaedics (Gold Medalist), with a Fellowship in Arthroscopy & Sports Medicine." },
  { icon: Activity, title: "Experience", body: "10+ years in orthopaedics, arthroscopy, sports medicine and joint replacement." },
  { icon: Trophy, title: "Sport", body: "Team Doctor for Bengaluru Football Club, managing injuries and return-to-play." },
  { icon: Hospital, title: "Hospitals", body: "Visiting consultant at Narayana Hrudayalaya and Manipal Hospital; consults at Raghava Multispeciality Hospital, Attibele and Health Nest Hospital, HSR Layout." },
] as const;

const STEPS = [
  { icon: ClipboardCheck, title: "Assess", body: "A first visit focused on your history, how you move, and what you want to get back to.", tone: "secondary" },
  { icon: MessageSquareText, title: "Explain & agree", body: "Findings in plain words, then a plan — sessions, home exercises and an itemised fee — that you agree to first.", tone: "tertiary" },
  { icon: Dumbbell, title: "Treat & strengthen", body: "Hands-on care to settle pain, then progressive strength work so the improvement lasts.", tone: "primary" },
] as const;

export default async function AboutPage() {
  const clinic = await getPublicClinic();
  return (
    <>
      <PageHero eyebrow="About us" title={`About ${clinic?.tradeName ?? "the clinic"}`} lead="Physiotherapy under the clinical direction of an orthopaedic surgeon — so your rehab plan and your diagnosis stay joined up." />
      <section className="wrap section" aria-labelledby="doctor-h">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          <div data-reveal>
            <p className="eyebrow">Led by</p>
            <h2 id="doctor-h" className="headline-large mt-2">{ORTHO.name}</h2>
            <p className="title-medium mt-2 text-[var(--color-ink-muted)]">Orthopaedic &amp; sports-medicine surgeon</p>
            <div className="prose-clinic body-large mt-6 space-y-4">
              <p>
                Physio Central is led by Dr Nitin Sunku, a fellowship-trained orthopaedic surgeon whose practice focuses on
                arthroscopy, sports injuries and joint replacement. He treats knee, shoulder, hip, back and neck problems, and
                takes a conservative-first approach: surgery is recommended only when its benefits clearly outweigh the risks.
              </p>
              <p>
                Good recovery depends as much on rehabilitation as on the diagnosis or the operation. Physio Central brings that
                rehabilitation under the same clinical direction, so your physiotherapy plan follows what your orthopaedic
                assessment found, and your physiotherapist can refer you back to Dr Sunku quickly if something needs a closer look.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={ORTHO.url} target="_blank" rel="noopener" className="btn btn-tonal">Dr Sunku&apos;s orthopaedic practice <ArrowUpRight size={16} aria-hidden="true" /></a>
              <a href={ORTHO.phoneHref} className="btn btn-secondary">Ortho queries: {ORTHO.phone}</a>
            </div>
          </div>
          <ul className="grid gap-6 sm:grid-cols-2">
            {FACTS.map((f, i) => (
              <li key={f.title} className="card" data-reveal={String(i * 80)}>
                <f.icon size={24} strokeWidth={1.6} aria-hidden="true" className="text-[var(--md-sys-color-primary)]" />
                <h3 className="title-medium mt-3">{f.title}</h3>
                <p className="body-medium mt-1 text-[var(--color-ink-muted)]">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="wrap section border-t border-[var(--color-line)]" aria-labelledby="approach-h">
        <h2 id="approach-h" className="headline-large">Our approach</h2>
        <ol className="mt-10 grid gap-10 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} data-reveal={String(i * 80)}>
              <span className="grid h-14 w-14 place-items-center rounded-[var(--md-sys-shape-lg)]" style={{ background: `var(--md-sys-color-${s.tone}-container)`, color: `var(--md-sys-color-on-${s.tone}-container)` }}><s.icon size={26} strokeWidth={1.6} aria-hidden="true" /></span>
              <h3 className="headline-small mt-5">{s.title}</h3>
              <p className="body-medium mt-2 text-[var(--color-ink-muted)]">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-14 flex flex-wrap gap-3"><Link href="/book" className="btn btn-primary">Request appointment</Link><Link href="/contact" className="btn btn-secondary">Contact the clinic</Link></div>
      </section>
    </>
  );
}
