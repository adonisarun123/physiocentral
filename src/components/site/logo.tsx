/** Original wordmark: a mint tile with a stylised spine/joint mark + serif name. */
export function Logo({ name = "Physio Central", inverted = false }: { name?: string; inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="9" fill="#7ee2b0" />
        <path d="M17 6.5c-2.3 2.6-2.3 5.4 0 8s2.3 5.4 0 8-2.3 3.2 0 5" stroke="#0f2f45" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <circle cx="17" cy="6.8" r="1.9" fill="#0f2f45" />
        <path d="M9 18.5c2.6 1.6 5.2 1.6 8 0M25 18.5c-2.6 1.6-5.2 1.6-8 0" stroke="#0e7c66" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </svg>
      <span className={`font-display text-[1.3rem] font-semibold leading-none ${inverted ? "text-white" : "text-[var(--color-ink)]"}`}>
        {name}
      </span>
    </span>
  );
}
