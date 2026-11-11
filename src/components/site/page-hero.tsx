import type { ReactNode } from "react";

/**
 * Inner-page header (M3 headline type, brand serif).
 * tone="surface" is the warm default; tone="band" is the deep brand band.
 */
export function PageHero({ eyebrow, title, lead, children, tone = "surface" }: { eyebrow: string; title: ReactNode; lead?: ReactNode; children?: ReactNode; tone?: "surface" | "band" }) {
  const band = tone === "band";
  return (
    <section className={band ? "band on-band hero-band" : "border-b border-[var(--color-line)] bg-[var(--md-sys-color-surface-container-low)]"}>
      <div className={band ? "wrap py-16 sm:py-24" : "wrap py-14 sm:py-20"} data-reveal>
        <span className="brand-rule" aria-hidden="true"><i /><i /><i /></span>
        <p className={band ? "eyebrow-caps mt-5" : "eyebrow mt-5"}>{eyebrow}</p>
        <h1 className="display-medium mt-3 max-w-4xl">{title}</h1>
        {lead ? <p className={`body-large prose-clinic mt-5 ${band ? "text-[var(--md-sys-color-inverse-on-surface)]" : "text-[var(--color-ink-muted)]"}`}>{lead}</p> : null}
        {children ? <div className="mt-8 flex flex-wrap gap-3">{children}</div> : null}
      </div>
    </section>
  );
}
