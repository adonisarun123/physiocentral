import Link from "next/link";
import type { Metadata } from "next";
import { getPublicTherapists } from "@/modules/content/public";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Our Team", description: "Physiotherapists at the clinic.", alternates: { canonical: "/team" } };

export default async function TeamPage() {
  const team = await getPublicTherapists();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title="Our Team" />
      {team.length === 0 ? (
        <p className="prose-clinic">Therapist profiles are published only after the clinic has verified qualifications and registration details.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {team.map((t) => (
            <li key={t.id} className="card">
              <h2 className="text-lg font-bold"><Link href={`/team/${t.slug}`}>{t.displayName}</Link></h2>
              <p className="text-[var(--color-ink-muted)]">{t.designation}</p>
              {t.languages.length ? <p className="mt-1 text-sm">Languages: {t.languages.join(", ")}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
