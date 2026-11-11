import Link from "next/link";
import type { Metadata } from "next";
import { Check, ArrowRight } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { pageOpenGraph } from "@/lib/seo";
import {
  CORE_PRICES, PACKAGES, SPECIALIST_PRICES, PACKAGE_INCLUDES, PACKAGE_BEST_FOR, PRICES_UPDATED, CONSULTATION_VALIDITY_DAYS, CONSULTATION, SINGLE_SESSION, LONG_COURSE,
  rupees, perSession, type PriceItem,
} from "@/content/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Physiotherapy fees at Physio Central: consultation ₹400, single session ₹800, 7-, 10- and 30-day treatment packages, dry needling, cupping and sports massage.",
  alternates: { canonical: "/pricing" },
  openGraph: pageOpenGraph("/pricing"),
};

function PriceTable({ title, items, caption }: { title: string; items: PriceItem[]; caption?: string }) {
  return (
    <div className="card" data-reveal>
      <h2 className="title-large">{title}</h2>
      {caption ? <p className="body-small mt-1 text-[var(--color-ink-muted)]">{caption}</p> : null}
      <ul className="mt-4 divide-y divide-[var(--color-line)]">
        {items.map((p) => (
          <li key={p.name} className="flex items-baseline justify-between gap-4 py-3">
            <span>
              <span className="title-medium">{p.name}</span>
              {p.sessions ? <span className="body-small block text-[var(--color-ink-muted)]">{p.sessions} sessions, one a day</span> : null}
              {p.note ? <span className="body-small block text-[var(--color-ink-muted)]">{p.note}</span> : null}
            </span>
            <span className="shrink-0 text-right">
              <span className="headline-small whitespace-nowrap text-[var(--md-sys-color-primary)]">{rupees(p.amount)}</span>
              {p.unit ? <span className="body-small block text-[var(--color-ink-muted)]">{p.unit}</span> : null}
              {perSession(p) ? <span className="body-small block whitespace-nowrap text-[var(--color-ink-muted)]">{rupees(perSession(p)!)} / session</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Clear fees, no surprises"
        lead="Pay per session, or choose a package that bundles every treatment your physiotherapist recommends. Your therapist suggests a plan after assessing you."
      >
        <Link href="/book" className="btn btn-primary">Request appointment</Link>
      </PageHero>

      <div className="wrap section">
        <div className="grid gap-6 lg:grid-cols-3">
          <PriceTable title="Consultation & sessions" items={CORE_PRICES} />
          <PriceTable title="Treatment packages" items={PACKAGES} caption="Every treatment below is included, with no extra charge." />
          <PriceTable title="Specialist therapies" items={SPECIALIST_PRICES} caption="Prices when booked on their own. Included free in every package." />
        </div>

        <div className="mt-16 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <section aria-labelledby="included-h" data-reveal>
            <p className="eyebrow">Our package benefits</p>
            <h2 id="included-h" className="headline-medium mt-2">All treatments included</h2>
            <ul className="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {PACKAGE_INCLUDES.map((t) => (
                <li key={t} className="body-large flex items-start gap-3">
                  <Check size={20} className="mt-1 shrink-0 text-[var(--md-sys-color-tertiary)]" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="bestfor-h" className="card card-filled" data-reveal="80">
            <h2 id="bestfor-h" className="headline-small">Packages are best for</h2>
            <ul className="mt-4 space-y-2">
              {PACKAGE_BEST_FOR.map((t) => <li key={t} className="body-large">• {t}</li>)}
            </ul>
          </section>
        </div>

        <section aria-labelledby="how-h" className="mt-16 max-w-3xl" data-reveal>
          <h2 id="how-h" className="headline-small">How fees work</h2>
          <ul className="body-large mt-4 list-disc space-y-2 pl-5 text-[var(--color-ink-muted)]">
            <li>Paying per visit: {rupees(CONSULTATION.amount)} consultation on your first visit, then {rupees(SINGLE_SESSION.amount)} for each session.</li>
            <li>With a package, the consultation is free. It stays valid for {CONSULTATION_VALIDITY_DAYS} days from your first visit.</li>
            <li>A 7-, 10- or 30-day package covers that many sessions, one a day. It includes every treatment listed above that your physiotherapist recommends.</li>
            <li>If you need 16 or more sessions, each one costs {rupees(LONG_COURSE.amount)}, and there&apos;s no consultation fee.</li>
            <li>Dry needling, cupping and sports massage are included in packages. The specialist prices apply only when you book them on their own.</li>
          </ul>
        </section>

        <p className="body-small mt-12 max-w-3xl text-[var(--color-ink-muted)]">
          Prices in Indian rupees, updated {PRICES_UPDATED}. Fees may change; the fee confirmed at the clinic before treatment applies.
          See our <Link href="/cancellation-refunds">cancellation &amp; refunds policy</Link>.
        </p>
        <Link href="/book" className="link-arrow mt-6 inline-flex text-[var(--md-sys-color-primary)]">Book an assessment <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </>
  );
}
