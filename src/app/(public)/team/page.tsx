import Link from "next/link";
import type { Metadata } from "next";
import { getPublicTherapists } from "@/modules/content/public";
import { PageHero } from "@/components/site/page-hero";
import { ORTHO } from "@/components/site/ortho-referral";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { pageOpenGraph } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Our Team", description: "Physiotherapists at the clinic.", alternates: { canonical: "/team" }, openGraph: pageOpenGraph("/team") };

export default async function TeamPage() {
  const team = await getPublicTherapists();
  return (
    <>
      <PageHero eyebrow="Our team" title="The people who look after you" lead="Physiotherapy led by an orthopaedic and sports-medicine surgeon, delivered one-to-one by our physiotherapists." />
      <div className="wrap section">
        {team.length === 0 ? (
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <span className="grid aspect-[4/5] max-h-[28rem] place-items-center rounded-[var(--md-sys-shape-xl)] bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]" aria-hidden="true">
              <span className="font-display text-[6rem] leading-none">NS</span>
            </span>
            <div data-reveal>
              <p className="eyebrow">Clinical lead</p>
              <h2 className="headline-large mt-2">{ORTHO.name}</h2>
              <p className="title-medium mt-2 text-[var(--md-sys-color-primary)]">Consultant orthopaedic surgeon · Arthroscopy, sports medicine &amp; joint replacement</p>
              <p className="body-small mt-1 text-[var(--color-ink-muted)]">{ORTHO.registration}</p>
              <p className="body-large mt-5 max-w-xl text-[var(--color-ink-muted)]">
                {ORTHO.credentials}. Team Doctor for Bengaluru Football Club. Dr Sunku directs clinical care at Physio Central, so every
                treatment plan is built on an orthopaedic understanding of your problem.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/about#doctor-h" className="btn btn-primary">Full profile <ArrowRight size={16} aria-hidden="true" /></Link>
                <a href={ORTHO.url} target="_blank" rel="noopener" className="btn btn-secondary">Orthopaedic practice <ArrowUpRight size={16} aria-hidden="true" /></a>
              </div>
              <p className="body-medium mt-8 text-[var(--color-ink-muted)]">Physiotherapist profiles are added here once their qualifications and registration have been verified.</p>
            </div>
          </div>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((t, i) => (
              <li key={t.id}>
                <Link href={`/team/${t.slug}`} className="group flex h-full flex-col no-underline">
                  <span className="grid aspect-[4/5] place-items-center rounded-[var(--md-sys-shape-md)]" style={{ background: `var(--md-sys-color-${["secondary", "tertiary", "primary"][i % 3]}-container)`, color: `var(--md-sys-color-on-${["secondary", "tertiary", "primary"][i % 3]}-container)` }} aria-hidden="true">
                    <span className="font-display text-[5rem] leading-none">{t.displayName.replace(/^Dr\.? /, "").split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
                  </span>
                  <span className="headline-small mt-5 text-[var(--color-ink)] group-hover:underline">{t.displayName}</span>
                  <span className="title-small mt-1 text-[var(--md-sys-color-primary)]">{t.designation}</span>
                  {t.languages.length ? <span className="mt-3 flex flex-wrap gap-2">{t.languages.map((l) => <span key={l} className="chip">{l}</span>)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
