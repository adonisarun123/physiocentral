import Image from "next/image";

/**
 * Brand lock-up: the supplied runner mark (vector) + serif wordmark.
 * "Physio Central by Dr Nitin Sunku" renders as the wordmark with an endorsement line.
 */
export function Logo({ name = "Physio Central", inverted = false, size = 44 }: { name?: string; inverted?: boolean; size?: number }) {
  const [brand, by] = name.split(/\s+by\s+/i);
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={inverted ? "grid place-items-center rounded-[10px] bg-white p-1" : "contents"}>
        <Image src="/brand/logo-mark.svg" alt="" width={Math.round(size * 0.82)} height={size} priority unoptimized />
      </span>
      <span className="flex flex-col">
        <span className={`font-display whitespace-nowrap text-[1.45rem] leading-none ${inverted ? "text-white" : "text-[var(--color-ink)]"}`}>{brand}</span>
        {by ? (
          <span className={`mt-1 whitespace-nowrap text-[0.75rem] font-medium leading-none ${inverted ? "text-[var(--md-sys-color-inverse-on-surface-variant)]" : "text-[var(--color-ink-muted)]"}`}>by {by}</span>
        ) : null}
      </span>
    </span>
  );
}
