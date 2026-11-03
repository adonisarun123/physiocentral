import type { ReactNode } from "react";

/** Inner-page header: pill eyebrow + two-tone serif title on a soft band. */
export function PageHero({ eyebrow, title, lead, children }: { eyebrow: string; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-b border-[var(--color-line)] bg-[var(--color-surface-alt)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="display mt-4 max-w-3xl text-[2.3rem] sm:text-[3rem]">{title}</h1>
        {lead ? <p className="prose-clinic mt-4 text-lg text-[var(--color-ink-muted)]">{lead}</p> : null}
        {children ? <div className="mt-6 flex flex-wrap gap-3">{children}</div> : null}
      </div>
    </section>
  );
}
