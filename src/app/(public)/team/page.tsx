import Link from "next/link";
import type { Metadata } from "next";
import { getPublicTherapists } from "@/modules/content/public";
import { PageHero } from "@/components/site/page-hero";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Our Team", description: "Physiotherapists at the clinic.", alternates: { canonical: "/team" } };

export default async function TeamPage() {
  const team = await getPublicTherapists();
  return (
    <>
      <PageHero eyebrow="Our team" title="The people who look after you" lead="Profiles are published only after the clinic has verified qualifications and registration details." />
      <div className="wrap section">
        {team.length === 0 ? (
          <div className="card max-w-2xl"><p className="body-large">Clinician profiles will appear here once verification is complete.</p><Link href="/book" className="btn btn-primary mt-6">Request appointment</Link></div>
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
