import Image from "next/image";

/**
 * Brand lock-up: the supplied runner mark (vector) + wordmark.
 * "Physio Central by Dr Nitin Sunku" renders as the wordmark with an endorsement line.
 */
export function Logo({ name = "Physio Central", inverted = false, size = 40 }: { name?: string; inverted?: boolean; size?: number }) {
  const [brand, by] = name.split(/\s+by\s+/i);
  const [first, ...rest] = brand.split(" ");
  return (
    <span className="inline-flex items-center gap-2">
      <Image src="/brand/logo-mark.svg" alt="" width={Math.round(size * 0.82)} height={size} priority unoptimized />
      <span className="flex flex-col">
        <span className={`font-display text-[1.3rem] font-extrabold leading-none tracking-tight ${inverted ? "text-white" : "text-[var(--color-ink)]"}`}>
          {first}
          {rest.length ? <span className={inverted ? "text-[#5aa9ff]" : "text-[var(--color-brand)]"}> {rest.join(" ")}</span> : null}
        </span>
        {by ? (
          <span className={`mt-1 text-[0.72rem] font-semibold uppercase leading-none tracking-[0.12em] ${inverted ? "text-white/70" : "text-[var(--color-ink-muted)]"}`}>
            by {by}
          </span>
        ) : null}
      </span>
    </span>
  );
}
