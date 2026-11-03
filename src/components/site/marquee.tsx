"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";

const DOTS = ["var(--brand-logo-blue)", "var(--brand-logo-green)", "var(--brand-logo-orange)"];

/** Spear's moving credibility strip, rebuilt as "what we treat" — pausable (WCAG 2.2.2). */
export function Marquee({ items, label }: { items: string[]; label: string }) {
  const [paused, setPaused] = useState(false);
  return (
    <section className="marquee band on-band relative overflow-hidden" data-paused={paused} aria-label={label}>
      <ul className="sr-only">{items.map((m) => <li key={m}>{m}</li>)}</ul>
      <div className="marquee-track py-8" aria-hidden="true">
        {[...items, ...items].map((m, i) => (
          <span key={i} className="font-display flex items-center gap-9 pl-9 text-[1.5rem] whitespace-nowrap text-white">
            {m}
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DOTS[i % 3] }} />
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? "Play moving list" : "Pause moving list"}
        className="state absolute top-1/2 right-4 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-[var(--md-sys-color-inverse-surface)] text-white"
      >
        {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
      </button>
    </section>
  );
}
