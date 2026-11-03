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
      <PageHero eyebrow="Our team" title={<>The people who <em>look after you</em></>} lead="Profiles are published only after the clinic has verified qualifications and registration details." />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
        {team.length === 0 ? (
          <div className="card max-w-2xl"><p>Therapist profiles will appear here once verification is complete.</p></div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((t) => (
              <li key={t.id}>
                <Link href={`/team/${t.slug}`} className="card card-hover flex h-full flex-col gap-3 no-underline">
                  <span className="font-display grid h-16 w-16 place-items-center rounded-full bg-[var(--color-brand)] text-2xl font-extrabold text-white" aria-hidden="true">
                    {t.displayName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </span>
                  <span className="font-display text-xl font-extrabold tracking-tight text-[var(--color-ink)]">{t.displayName}</span>
                  <span className="text-[var(--color-ink-muted)]">{t.designation}</span>
                  {t.languages.length ? <span className="flex flex-wrap gap-2 text-sm">{t.languages.map((l) => <span key={l} className="chip">{l}</span>)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
