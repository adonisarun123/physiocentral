import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Clock, ShieldCheck, UserRound, CalendarCheck, MapPin, Phone } from "lucide-react";
import { getOpeningHours, getPublicBranches, getPublicClinic, getPublicServices, getPublicTherapists } from "@/modules/content/public";
import { JsonLd, clinicJsonLd } from "@/modules/content/schema";
import { formatINR } from "@/modules/billing/money";
import { WEEKDAYS, telHref } from "@/lib/format";
import { BODY_AREAS } from "@/components/site/body-areas";
import { Icon, iconForCategory } from "@/components/site/icon";
import { AssessmentMock, BookingMock, EstimateMock, StatusMock } from "@/components/site/mocks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}

function FeatureRow({
  eyebrow, title, body, fact, factLabel, panel, mock, reverse, cta,
}: {
  eyebrow: string; title: React.ReactNode; body: string; fact: string; factLabel: string;
  panel: "mint" | "sky"; mock: React.ReactNode; reverse?: boolean; cta?: { href: string; label: string };
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={reverse ? "lg:order-2" : ""}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="display mt-4 text-3xl sm:text-[2.1rem]">{title}</h3>
        <p className="prose-clinic mt-4 text-lg text-[var(--color-ink-muted)]">{body}</p>
        <div className="card mt-6 inline-block px-4 py-3">
          <p className="font-display text-2xl font-semibold text-[var(--color-brand)]">{fact}</p>
          <p className="text-sm text-[var(--color-ink-muted)]">{factLabel}</p>
        </div>
        {cta ? (
          <p className="mt-6"><Link href={cta.href} className="btn btn-link no-underline">{cta.label} <ArrowRight size={18} aria-hidden="true" /></Link></p>
        ) : null}
      </div>
      <div className={`panel-${panel} grid min-h-[22rem] place-items-center p-8 ${reverse ? "lg:order-1" : ""}`}>{mock}</div>
    </div>
  );
}

export default async function HomePage() {
  const [clinic, branches, services, team] = await Promise.all([getPublicClinic(), getPublicBranches(), getPublicServices(), getPublicTherapists()]);
  const branch = branches[0];
  const hours = branch ? await getOpeningHours(branch.id) : [];
  const name = clinic?.tradeName ?? "Physio Central";
  const verified = Boolean(clinic?.identityVerified && branch?.addressVerified);
  const place = branch?.addressVerified ? [branch.locality, branch.city].filter(Boolean).join(", ") : null;
  const ld = clinic && branch ? clinicJsonLd(clinic, branch, services) : null;
  const response = branch?.responseWindow ?? "within one working day";

  return (
    <>
      {ld ? <JsonLd data={ld} /> : null}

      {/* ── Hero ── */}
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-10 sm:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
          <div>
            <div className="flex flex-wrap gap-2">
              <Eyebrow><Icon name="Stethoscope" size={15} /> Physiotherapy clinic{place ? ` · ${place}` : ""}</Eyebrow>
              <Eyebrow><UserRound size={15} aria-hidden="true" /> One-to-one care</Eyebrow>
            </div>
            <h1 className="display mt-5 text-[2.6rem] sm:text-[3.4rem] lg:text-[3.8rem]">
              Move better. <em>Recover properly.</em> With a plan built around you.
            </h1>
            <p className="prose-clinic mt-5 text-lg text-[var(--color-ink-muted)] sm:text-xl">
              {name} starts with a proper assessment, explains what&apos;s going on, and agrees a treatment plan — and its cost — with you before anything begins.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/book" className="btn btn-primary px-6 py-3 text-base">Request an appointment <ArrowRight size={18} aria-hidden="true" /></Link>
              <Link href="#how" className="btn btn-link no-underline">See how it works <ArrowRight size={18} aria-hidden="true" /></Link>
            </div>
          </div>
          <div className="panel-mint grid min-h-[24rem] place-items-center p-8">
            <BookingMock />
          </div>
        </div>

        {/* Fact chips — honest product facts, never invented counts */}
        <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-2 px-4 pb-14" aria-label="Good to know">
          <li className="chip"><Clock size={16} className="text-[var(--color-brand)]" aria-hidden="true" /> Request online in ~2 minutes</li>
          <li className="chip"><UserRound size={16} className="text-[var(--color-brand)]" aria-hidden="true" /> No account needed</li>
          <li className="chip"><CalendarCheck size={16} className="text-[var(--color-brand)]" aria-hidden="true" /> Clinic confirms {response}</li>
          <li className="chip"><ShieldCheck size={16} className="text-[var(--color-brand)]" aria-hidden="true" /> No extra charges without your approval</li>
        </ul>
      </section>

      {/* ── Where does it hurt? ── */}
      <section className="bg-[var(--color-surface-alt)]" aria-labelledby="hurt-h">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Eyebrow>Start here</Eyebrow>
              <h2 id="hurt-h" className="display mt-4 text-3xl sm:text-[2.6rem]">Tell us <em>where it hurts</em></h2>
              <p className="prose-clinic mt-3 text-lg text-[var(--color-ink-muted)]">Pick the area that bothers you. Your physiotherapist assesses you in person before recommending any treatment.</p>
            </div>
            <Link href="/book" className="btn btn-secondary">Not sure? Book an assessment</Link>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BODY_AREAS.map((a) => (
              <li key={a.key}>
                <Link href="/book" className="card card-hover flex h-full flex-col gap-3 no-underline">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]"><Icon name={a.icon} size={22} /></span>
                  <span className="font-display text-lg font-semibold text-[var(--color-ink)]">{a.label}</span>
                  <span className="text-sm text-[var(--color-ink-muted)]">{a.examples}</span>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-brand)]">Request assessment <ArrowRight size={15} aria-hidden="true" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── How it works (alternating feature rows) ── */}
      <section id="how" className="scroll-mt-24" aria-labelledby="how-h">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>How it works</Eyebrow>
            <h2 id="how-h" className="display mt-4 text-3xl sm:text-[2.8rem]">The complete <em>assessment-to-recovery</em> pathway</h2>
            <p className="mt-4 text-lg text-[var(--color-ink-muted)]">Clear steps, clear costs, and a team that tells you what to expect at every stage.</p>
          </div>
          <div className="mt-16 space-y-20">
            <FeatureRow
              eyebrow="Step 1"
              title={<>Assessment first, <em>not guesswork</em></>}
              body="Your first visit is about understanding you — your history, your goals and how you move — so treatment targets the cause, not just the symptom."
              fact="1 : 1"
              factLabel="time with your physiotherapist"
              panel="sky"
              mock={<AssessmentMock />}
              cta={{ href: "/services", label: "Explore services" }}
            />
            <FeatureRow
              reverse
              eyebrow="Step 2"
              title={<>A plan you understand — <em>and costs you approve</em></>}
              body="You see an itemised estimate before treatment. If anything extra is needed later, you approve the new total first. No surprise lines on your bill."
              fact="0"
              factLabel="extra charges without your approval"
              panel="mint"
              mock={<EstimateMock />}
            />
            <FeatureRow
              eyebrow="Step 3"
              title={<>Book and manage <em>online</em></>}
              body="Request a time in a couple of minutes, get a reference instantly, and use your private link to check status or cancel. Prefer to talk? Just call."
              fact="2 min"
              factLabel="to send a request — no account"
              panel="sky"
              mock={<StatusMock />}
              cta={{ href: "/book", label: "Request an appointment" }}
            />
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section className="bg-[var(--color-surface-alt)]" aria-labelledby="svc-h">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Eyebrow>What we do</Eyebrow>
              <h2 id="svc-h" className="display mt-4 text-3xl sm:text-[2.6rem]">Treatments <em>we offer</em></h2>
            </div>
            {services.length ? <Link href="/services" className="btn btn-link no-underline">All services <ArrowRight size={18} aria-hidden="true" /></Link> : null}
          </div>
          {services.length === 0 ? (
            <div className="card mt-8 max-w-2xl">
              <p className="font-semibold">Service details are being reviewed by our clinical lead.</p>
              <p className="mt-1 text-[var(--color-ink-muted)]">They&apos;ll appear here shortly. Meanwhile, request an assessment or call us — we&apos;ll guide you to the right care.</p>
            </div>
          ) : (
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link href={`/services/${s.slug}`} className="card card-hover flex h-full flex-col gap-3 no-underline">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-sky)] text-[var(--color-ink)]"><Icon name={iconForCategory(s.category)} size={22} /></span>
                    <span className="font-display text-xl font-semibold text-[var(--color-ink)]">{s.name}</span>
                    {s.summary ? <span className="text-[var(--color-ink-muted)]">{s.summary}</span> : null}
                    <span className="mt-auto flex flex-wrap gap-2 pt-2 text-sm">
                      <span className="chip">{s.durationMinutes} min</span>
                      <span className="chip">{s.pricePaise ? formatINR(s.pricePaise) : "Fee after assessment"}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Team ── */}
      {team.length ? (
        <section aria-labelledby="team-h">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <Eyebrow>Our team</Eyebrow>
            <h2 id="team-h" className="display mt-4 text-3xl sm:text-[2.6rem]">Who will <em>look after you</em></h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {team.map((t) => (
                <li key={t.id}>
                  <Link href={`/team/${t.slug}`} className="card card-hover flex items-center gap-4 no-underline">
                    <span className="font-display grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--color-mint)] text-xl font-semibold text-[var(--color-ink)]" aria-hidden="true">
                      {t.displayName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                    </span>
                    <span>
                      <span className="font-display block text-lg font-semibold text-[var(--color-ink)]">{t.displayName}</span>
                      <span className="block text-sm text-[var(--color-ink-muted)]">{t.designation}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ── Visit us ── */}
      <section aria-labelledby="visit-h">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:py-20 lg:grid-cols-2">
          <div>
            <Eyebrow><MapPin size={15} aria-hidden="true" /> Visit us</Eyebrow>
            <h2 id="visit-h" className="display mt-4 text-3xl sm:text-[2.6rem]">Easy to reach, <em>easy to book</em></h2>
            {verified && branch ? (
              <address className="mt-4 text-lg not-italic">{[branch.addressLine, branch.locality, branch.city].filter(Boolean).join(", ")}</address>
            ) : (
              <p className="mt-4 text-lg text-[var(--color-ink-muted)]">Our address, map and parking details are being confirmed and will appear here soon.</p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/locations/main" className="btn btn-secondary">Hours &amp; directions</Link>
              {branch?.phone ? <a href={telHref(branch.phone)} className="btn btn-secondary"><Phone size={16} aria-hidden="true" /> {branch.phone}</a> : null}
            </div>
          </div>
          <div className="card">
            <p className="font-display text-xl font-semibold">Opening hours</p>
            {hours.length === 0 ? (
              <p className="mt-2 text-[var(--color-ink-muted)]">Hours will be published soon. Call us to check availability.</p>
            ) : (
              <table className="data mt-3"><tbody>
                {WEEKDAYS.map((d, i) => {
                  const h = hours.find((x) => x.weekday === i);
                  return <tr key={d}><th scope="row" className="!normal-case !text-sm !tracking-normal">{d}</th><td>{h ? `${h.opens} – ${h.closes}` : "Closed"}</td></tr>;
                })}
              </tbody></table>
            )}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="px-4 pb-16 sm:pb-24">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[var(--color-ink)] px-6 py-14 text-center text-white sm:px-12">
          <h2 className="font-display mx-auto max-w-2xl text-3xl font-semibold leading-tight sm:text-[2.6rem]">
            Ready to start <span className="text-[var(--color-mint)]">feeling better?</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">Send a request in two minutes. We&apos;ll confirm a time {response}. Your request is pending until the clinic confirms it.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/book" className="btn btn-primary px-6 py-3 text-base">Request an appointment <ArrowRight size={18} aria-hidden="true" /></Link>
            {branch?.phone ? <a href={telHref(branch.phone)} className="btn border-white/40 px-6 py-3 text-base text-white hover:bg-white/10"><Phone size={18} aria-hidden="true" /> Call the clinic</a> : null}
          </div>
        </div>
      </section>
    </>
  );
}
