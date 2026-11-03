import Image from "next/image";
import { CalendarCheck, Clock, MapPin } from "lucide-react";

export interface HeroLiveData {
  nextSlotLabel: string | null; // e.g. "Tomorrow, 9:15 am"
  openLabel: string | null;     // e.g. "Open now · until 1:00 pm"
  openNow: boolean;
  place: string | null;         // e.g. "Sector 2, HSR Layout"
}

/**
 * Hero media in the Spear shape (large rounded lower-left corner): a temporary
 * licensed stock photo until clinic photography arrives. The M3 elevated cards
 * show LIVE data only.
 */
export function HeroVisual({ live }: { live: HeroLiveData }) {
  return (
    <div className="relative" data-reveal="120">
      <div className="curve-bl relative aspect-[6/5] overflow-hidden bg-[var(--md-sys-color-surface-container-high)]">
        <Image src="/images/stock/hero.webp" alt="A physiotherapist examining a patient's knee on a treatment table" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
      </div>
      <ul className="mt-6 grid gap-3 sm:pointer-events-none sm:absolute sm:inset-0 sm:mt-0 sm:block" aria-label="Clinic status">
        {live.nextSlotLabel ? <LiveCard className="sm:top-6 sm:-left-8" icon={<CalendarCheck size={20} aria-hidden="true" />} tone="tertiary" label="Next available" value={live.nextSlotLabel} /> : null}
        {live.openLabel ? <LiveCard className="sm:top-[44%] sm:-right-6" icon={<Clock size={20} aria-hidden="true" />} tone="secondary" label="Clinic hours" value={live.openLabel} /> : null}
        {live.place ? <LiveCard className="sm:-bottom-6 sm:left-[18%]" icon={<MapPin size={20} aria-hidden="true" />} tone="primary" label="Find us" value={live.place} /> : null}
      </ul>
    </div>
  );
}

function LiveCard({ className, icon, label, value, tone }: { className: string; icon: React.ReactNode; label: string; value: string; tone: "primary" | "secondary" | "tertiary" }) {
  return (
    <li className={`flex sm:absolute items-center gap-3 rounded-[var(--md-sys-shape-md)] bg-[var(--md-sys-color-surface-container-lowest)] py-3 pr-5 pl-3 shadow-[var(--md-sys-elevation-2)] ${className}`}>
      <span className="grid h-10 w-10 place-items-center rounded-[var(--md-sys-shape-sm)]" style={{ background: `var(--md-sys-color-${tone}-container)`, color: `var(--md-sys-color-on-${tone}-container)` }}>{icon}</span>
      <span>
        <span className="label-medium block text-[var(--color-ink-muted)]">{label}</span>
        <span className="title-medium block">{value}</span>
      </span>
    </li>
  );
}
