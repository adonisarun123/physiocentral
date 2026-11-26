import { ArrowUpRight, Star } from "lucide-react";
import { GOOGLE_RATING, GOOGLE_REVIEWS, GOOGLE_REVIEWS_URL } from "@/content/google-reviews";

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }} aria-hidden="true">
            <Star size={size} strokeWidth={0} className="absolute inset-0 fill-[var(--md-sys-color-outline-variant)]" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} strokeWidth={0} className="fill-[var(--brand-logo-orange)]" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * Patient reviews from Google, shown as a static, verbatim wall.
 * Data and the rules for updating it live in src/content/google-reviews.ts.
 */
export function GoogleReviews({ headingId = "reviews-h", limit, className = "" }: { headingId?: string; limit?: number; className?: string }) {
  const reviews = typeof limit === "number" ? GOOGLE_REVIEWS.slice(0, limit) : GOOGLE_REVIEWS;
  return (
    <section className={`section ${className}`} aria-labelledby={headingId}>
      <div className="wrap grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start" data-reveal>
          <span className="brand-rule" aria-hidden="true"><i /><i /><i /></span>
          <p className="eyebrow mt-5">Patient reviews on Google</p>
          <h2 id={headingId} className="headline-large mt-3">What our patients say</h2>
          <div className="mt-8 flex items-end gap-4">
            <span className="font-display text-[clamp(3.5rem,7vw,4.75rem)] leading-none text-[var(--color-ink)]">{GOOGLE_RATING.rating.toFixed(1)}</span>
            <span className="pb-1.5">
              <Stars value={GOOGLE_RATING.rating} size={20} />
              <span className="body-medium mt-1 block text-[var(--color-ink-muted)]">from {GOOGLE_RATING.count} Google reviews</span>
            </span>
          </div>
          <p className="body-medium mt-6 max-w-sm text-[var(--color-ink-muted)]">Shown word for word as patients wrote them, including our 4-star review. Read every review, or leave your own, on Google.</p>
          <a href={GOOGLE_REVIEWS_URL} target="_blank" rel="noopener" className="btn btn-tonal mt-6">See all reviews on Google <ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>

        <ul className="columns-1 gap-5 sm:columns-2 [&>li]:mb-5">
          {reviews.map((r, i) => (
            <li key={r.name} className="card break-inside-avoid" data-reveal={String((i % 4) * 60)}>
              <figure className="m-0">
                <Stars value={r.rating} />
                <blockquote className="body-medium mt-3 text-[var(--color-ink)]">
                  {r.text.split("\n").map((line, j) => <p key={j} className={j ? "mt-2" : undefined}>{line}</p>)}
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--md-sys-color-secondary-container)] font-semibold text-[var(--md-sys-color-on-secondary-container)]" aria-hidden="true">{r.name[0]}</span>
                  <span>
                    <span className="title-small block text-[var(--color-ink)]">{r.name}</span>
                    <span className="body-small block text-[var(--color-ink-muted)]">{r.localGuide ? "Local Guide · " : ""}Google review · {r.when}</span>
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
