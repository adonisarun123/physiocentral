import Image from "next/image";

/** Brand lock-up: the supplied runner mark (vector) + wordmark. */
export function Logo({ name = "Physio Central", inverted = false, size = 40 }: { name?: string; inverted?: boolean; size?: number }) {
  const [first, ...rest] = name.split(" ");
  return (
    <span className="inline-flex items-center gap-2">
      <Image src="/brand/logo-mark.svg" alt="" width={Math.round(size * 0.82)} height={size} priority unoptimized />
      <span className={`font-display text-[1.3rem] font-extrabold leading-none tracking-tight ${inverted ? "text-white" : "text-[var(--color-ink)]"}`}>
        {first}
        {rest.length ? <span className={inverted ? "text-[#5aa9ff]" : "text-[var(--color-brand)]"}> {rest.join(" ")}</span> : null}
      </span>
    </span>
  );
}
