import Image from "next/image";
import { CalendarCheck, Clock, MapPin } from "lucide-react";

export interface HeroLiveData {
  nextSlotLabel: string | null; // e.g. "Tomorrow, 9:15 am"
  openLabel: string | null;     // e.g. "Open now · until 1:00 pm"
  openNow: boolean;
  place: string | null;         // e.g. "Sector 2, HSR Layout"
}

/**
 * Brand hero composition: the clinic's runner mark on a deep-blue stage with
 * orbit rings and speed streaks in the three logo colours. Floating cards show
 * LIVE data only (next real slot from the scheduling engine, open/closed from
 * published hours) — never invented numbers.
 */
export function HeroVisual({ live }: { live: HeroLiveData }) {
  return (
    <div className="relative mx-auto w-full max-w-[34rem]" data-reveal="150">
      <div className="relative aspect-[5/6] overflow-hidden rounded-[2.75rem] bg-gradient-to-br from-[#081427] via-[#0b2a5c] to-[#0059c2] shadow-[0_40px_80px_-30px_rgba(0,82,173,.6)]" aria-hidden="true">
        {/* dot grid */}
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.35) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
        {/* colour glows */}
        <div className="absolute -left-16 top-10 h-64 w-64 rounded-full bg-[#159c11] opacity-40 blur-[80px]" />
        <div className="absolute -right-10 bottom-0 h-72 w-72 rounded-full bg-[#f06200] opacity-35 blur-[90px]" />
        <div className="absolute right-10 top-0 h-56 w-56 rounded-full bg-[#0079f4] opacity-60 blur-[70px]" />
        {/* orbit rings */}
        <svg className="spin-slow absolute left-1/2 top-1/2 h-[118%] w-[118%] -translate-x-1/2 -translate-y-1/2" viewBox="0 0 400 400" fill="none">
          <circle cx="200" cy="200" r="190" stroke="rgba(255,255,255,.10)" strokeWidth="1" />
          <circle cx="200" cy="200" r="150" stroke="rgba(255,255,255,.14)" strokeWidth="1" strokeDasharray="2 6" />
          <circle cx="200" cy="200" r="110" stroke="rgba(255,255,255,.10)" strokeWidth="1" />
          <circle cx="390" cy="200" r="5" fill="#159c11" />
          <circle cx="200" cy="50" r="4" fill="#f06200" />
          <circle cx="90" cy="200" r="4" fill="#0079f4" />
        </svg>
        {/* speed streaks */}
        <div className="absolute left-[-10%] top-[42%] h-3 w-[55%] -rotate-[18deg] rounded-full bg-gradient-to-r from-transparent to-[#0079f4]/70 blur-[1px]" />
        <div className="absolute left-[-6%] top-[52%] h-2.5 w-[48%] -rotate-[18deg] rounded-full bg-gradient-to-r from-transparent to-[#159c11]/70 blur-[1px]" />
        <div className="absolute left-[-12%] top-[61%] h-2 w-[42%] -rotate-[18deg] rounded-full bg-gradient-to-r from-transparent to-[#f06200]/70 blur-[1px]" />
        {/* runner on a soft white disc so the logo colours read cleanly */}
        <div className="absolute left-1/2 top-1/2 h-[68%] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/95 shadow-[0_0_0_14px_rgba(255,255,255,.08),0_0_0_34px_rgba(255,255,255,.04)]" />
        <Image src="/brand/logo-mark.svg" alt="" fill unoptimized priority className="relative object-contain p-[22%] drop-shadow-[0_18px_30px_rgba(8,20,39,.35)]" />
      </div>

      {/* Live cards */}
      {live.nextSlotLabel ? (
        <div className="glass floaty absolute left-0 top-8 flex items-center gap-3 rounded-2xl px-4 py-3 sm:-left-8">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-logo-green)] text-white"><CalendarCheck size={20} aria-hidden="true" /></span>
          <span>
            <span className="block text-xs font-medium text-[var(--color-ink-muted)]">Next available</span>
            <span className="font-display block font-extrabold">{live.nextSlotLabel}</span>
          </span>
        </div>
      ) : null}
      {live.openLabel ? (
        <div className="glass floaty-slow absolute right-0 top-[46%] flex items-center gap-3 rounded-2xl px-4 py-3 sm:-right-8">
          <span className={`grid h-11 w-11 place-items-center rounded-xl text-white ${live.openNow ? "bg-[var(--color-brand)]" : "bg-[var(--color-ink)]"}`}><Clock size={20} aria-hidden="true" /></span>
          <span>
            <span className="block text-xs font-medium text-[var(--color-ink-muted)]">Clinic hours</span>
            <span className="font-display block font-extrabold">{live.openLabel}</span>
          </span>
        </div>
      ) : null}
      {live.place ? (
        <div className="glass floaty absolute -bottom-5 left-6 flex items-center gap-3 rounded-2xl px-4 py-3 sm:left-10">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-logo-orange)] text-white"><MapPin size={20} aria-hidden="true" /></span>
          <span>
            <span className="block text-xs font-medium text-[var(--color-ink-muted)]">Find us</span>
            <span className="font-display block font-extrabold">{live.place}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
