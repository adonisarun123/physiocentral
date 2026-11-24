import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CalendarCheck, Clock } from "lucide-react";

export interface HeroLiveData {
  nextSlotLabel: string | null; // e.g. "Tomorrow, 9:15 am"
  hoursLines: string[];         // fixed weekly timings, e.g. ["Mon–Sat 8:30 am–1:30 pm, 4–9 pm", "Sun 10 am–1 pm"]
  place: string | null;         // e.g. "Sector 2, HSR Layout" (shown in the hero eyebrow)
}

export interface HeroLead {
  name: string;
  role: string;
  href: string;
  photo: string;
}

/**
 * Hero media: the Spear shape (large rounded lower-left corner) on a soft
 * tinted backdrop, with glass cards floating over it. The photo is a temporary
 * licensed stock image until clinic photography arrives. Cards show real data
 * only. Clinic hours are the fixed weekly timings, not a live "open now"
 * status, so patients see the same thing at any time of day.
 */
export function HeroVisual({ live, lead }: { live: HeroLiveData; lead: HeroLead }) {
  return (
    <div className="hero-visual relative" data-reveal="160">
      <div className="relative">
        <span className="hero-shape" aria-hidden="true" />
        <span className="hero-ring" aria-hidden="true" />
        <div className="hero-frame relative aspect-[6/5] overflow-hidden bg-[var(--md-sys-color-surface-container-high)]">
          <Image src="/images/stock/hero-in.webp" alt="A physiotherapist explaining a spine model to a patient in a treatment room" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
        </div>
      </div>
      <ul className="mt-6 grid gap-3 sm:pointer-events-none sm:absolute sm:inset-0 sm:mt-0 sm:block" aria-label="Clinic at a glance">
        {live.nextSlotLabel ? (
          <li className="hero-card sm:absolute sm:top-7 sm:-left-4 lg:-left-8">
            <CardIcon tone="tertiary"><CalendarCheck size={20} aria-hidden="true" /></CardIcon>
            <CardText label="Next available" lines={[live.nextSlotLabel]} />
          </li>
        ) : null}
        {live.hoursLines.length ? (
          <li className="hero-card sm:absolute sm:top-[57%] sm:-right-3 lg:-right-6">
            <CardIcon tone="secondary"><Clock size={20} aria-hidden="true" /></CardIcon>
            <CardText label="Clinic hours" lines={live.hoursLines} />
          </li>
        ) : null}
        <li className="hero-card hero-card-link sm:pointer-events-auto sm:absolute sm:-bottom-7 sm:left-[14%]">
          <Link href={lead.href} className="group flex items-center gap-3 no-underline">
            <span className="relative block h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-white">
              <Image src={lead.photo} alt="" fill sizes="44px" className="object-cover object-top" />
            </span>
            <CardText label="Clinical direction" lines={[lead.name]} sub={lead.role} />
            <span className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] transition-transform duration-300 group-hover:rotate-45">
              <ArrowUpRight size={16} aria-hidden="true" />
            </span>
          </Link>
        </li>
      </ul>
    </div>
  );
}

function CardIcon({ tone, children }: { tone: "primary" | "secondary" | "tertiary"; children: React.ReactNode }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--md-sys-shape-md)]" style={{ background: `var(--md-sys-color-${tone}-container)`, color: `var(--md-sys-color-on-${tone}-container)` }}>{children}</span>
  );
}

function CardText({ label, lines, sub }: { label: string; lines: string[]; sub?: string }) {
  return (
    <span className="min-w-0">
      <span className="label-medium block text-[var(--color-ink-muted)]">{label}</span>
      {lines.map((line) => <span key={line} className="title-medium block text-[var(--color-ink)]">{line}</span>)}
      {sub ? <span className="body-small block text-[var(--color-ink-muted)]">{sub}</span> : null}
    </span>
  );
}
