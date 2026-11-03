import Link from "next/link";
import type { Metadata } from "next";
import { getPublicBranches, getPublicClinic, getPublicServices, getPublicTherapists } from "@/modules/content/public";
import { Notice } from "@/components/ui";
import { JsonLd, clinicJsonLd } from "@/modules/content/schema";
import { telHref } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const [clinic, branches, services, team] = await Promise.all([getPublicClinic(), getPublicBranches(), getPublicServices(), getPublicTherapists()]);
  const branch = branches[0];
  const name = clinic?.tradeName ?? "Physio Central";
  const location = branch?.addressVerified ? [branch.locality, branch.city].filter(Boolean).join(", ") : null;
  const ld = clinic && branch ? clinicJsonLd(clinic, branch, services) : null;

  return (
    <>
      {ld ? <JsonLd data={ld} /> : null}
      <section className="bg-[var(--color-brand-soft)]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h1 className="max-w-3xl text-3xl font-extrabold leading-tight sm:text-5xl">
            {name}: physiotherapy assessment and rehabilitation{location ? ` in ${location}` : ""}
          </h1>
          <p className="prose-clinic mt-4 text-lg text-[var(--color-ink-muted)]">
            Request an appointment online. The clinic reviews every request and confirms a time with you — a request is not a confirmed booking until you hear back.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/book" className="btn btn-primary">Request an appointment</Link>
            {branch?.phone ? <a href={telHref(branch.phone)} className="btn btn-secondary">Call {branch.phone}</a> : null}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-12">
        {!clinic?.identityVerified || !branch?.addressVerified ? (
          <Notice tone="warn" title="Clinic details are being finalised">
            Address, hours and team profiles will appear here once the clinic has verified them. You can still request an appointment or contact us.
          </Notice>
        ) : null}

        <section aria-labelledby="services-h">
          <h2 id="services-h" className="text-2xl font-bold">Services</h2>
          {services.length === 0 ? (
            <p className="mt-3 text-[var(--color-ink-muted)]">Service descriptions are under clinical review and will be published soon. Please call or send an enquiry.</p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.slice(0, 6).map((s) => (
                <li key={s.id} className="card">
                  <h3 className="text-lg font-bold"><Link href={`/services/${s.slug}`}>{s.name}</Link></h3>
                  {s.summary ? <p className="mt-1 text-[var(--color-ink-muted)]">{s.summary}</p> : null}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4"><Link href="/services">All services</Link></p>
        </section>

        <section aria-labelledby="team-h">
          <h2 id="team-h" className="text-2xl font-bold">Who provides care</h2>
          {team.length === 0 ? (
            <p className="mt-3 text-[var(--color-ink-muted)]">Therapist profiles are published once credentials have been verified.</p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {team.map((t) => (
                <li key={t.id} className="card">
                  <h3 className="font-bold"><Link href={`/team/${t.slug}`}>{t.displayName}</Link></h3>
                  <p className="text-[var(--color-ink-muted)]">{t.designation}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="how-h">
          <h2 id="how-h" className="text-2xl font-bold">How appointments work</h2>
          <ol className="prose-clinic mt-3 list-decimal space-y-2 pl-6">
            <li>Choose a service, a therapist or “Any available”, and a preferred time.</li>
            <li>Send your request. You get a reference number straight away.</li>
            <li>The clinic confirms the time or suggests an alternative{branch ? `, usually ${branch.responseWindow}` : ""}.</li>
            <li>For urgent scheduling questions, please call the clinic.</li>
          </ol>
          <p className="prose-clinic mt-3 text-sm text-[var(--color-ink-muted)]">
            This website does not assess or diagnose symptoms. If you have a medical emergency, call 112 or go to the nearest emergency department.
          </p>
        </section>
      </div>
    </>
  );
}
