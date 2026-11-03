import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, MessageSquareText, Dumbbell } from "lucide-react";
import { getPublicClinic } from "@/modules/content/public";
import { Notice } from "@/components/ui";
import { PageHero } from "@/components/site/page-hero";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "About", alternates: { canonical: "/about" } };

const STEPS = [
  { icon: ClipboardCheck, title: "Assess", body: "A first visit focused on your history, how you move, and what you want to get back to.", tone: "secondary" },
  { icon: MessageSquareText, title: "Explain & agree", body: "Findings in plain words, then a plan — sessions, home exercises and an itemised fee — that you agree to first.", tone: "tertiary" },
  { icon: Dumbbell, title: "Treat & strengthen", body: "Hands-on care to settle pain, then progressive strength work so the improvement lasts.", tone: "primary" },
] as const;

export default async function AboutPage() {
  const clinic = await getPublicClinic();
  return (
    <>
      <PageHero eyebrow="About us" title={`About ${clinic?.tradeName ?? "the clinic"}`} lead={clinic?.identityVerified && clinic.legalName ? `Operated by ${clinic.legalName}.` : undefined} />
      <section className="wrap section" aria-labelledby="approach-h">
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
        <div className="mt-14 max-w-3xl">
          <Notice title="More about us soon">
            The clinic&apos;s story, team and facilities will be published here once the clinic approves the text. We don&apos;t publish invented patient counts, awards or outcome claims.
          </Notice>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/book" className="btn btn-primary">Request appointment</Link><Link href="/contact" className="btn btn-secondary">Contact the clinic</Link></div>
        </div>
      </section>
    </>
  );
}
