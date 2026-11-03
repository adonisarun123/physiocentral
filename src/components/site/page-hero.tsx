import type { ReactNode } from "react";

/** Inner-page header: pill eyebrow + gradient-accent display title over soft brand glows. */
export function PageHero({ eyebrow, title, lead, children }: { eyebrow: string; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <section className="aurora grid-dots border-b border-[var(--color-line)]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20" data-reveal>
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="display mt-5 max-w-4xl text-[2.4rem] sm:text-[3.6rem]">{title}</h1>
        {lead ? <p className="prose-clinic mt-5 text-lg text-[var(--color-ink-muted)] sm:text-xl">{lead}</p> : null}
        {children ? <div className="mt-7 flex flex-wrap gap-3">{children}</div> : null}
      </div>
    </section>
  );
}
