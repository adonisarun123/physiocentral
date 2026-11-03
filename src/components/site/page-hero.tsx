import type { ReactNode } from "react";

/** Inner-page header (M3 headline type, brand serif, warm surface). */
export function PageHero({ eyebrow, title, lead, children }: { eyebrow: string; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-b border-[var(--color-line)] bg-[var(--md-sys-color-surface-container-low)]">
      <div className="wrap py-14 sm:py-20" data-reveal>
        <span className="brand-rule" aria-hidden="true"><i /><i /><i /></span>
        <p className="eyebrow mt-5">{eyebrow}</p>
        <h1 className="display-medium mt-3 max-w-4xl">{title}</h1>
        {lead ? <p className="body-large prose-clinic mt-5 text-[var(--color-ink-muted)]">{lead}</p> : null}
        {children ? <div className="mt-8 flex flex-wrap gap-3">{children}</div> : null}
      </div>
    </section>
  );
}
