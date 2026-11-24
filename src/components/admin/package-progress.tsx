import { formatDate } from "@/lib/format";

const dayLabel = (d: string) => formatDate(`${d}T12:00:00+05:30`);

/**
 * "3 of 7 used · 4 booked" with a two-tone bar. A session is used when the
 * patient checks in; missed visits (no-shows) also use up a place.
 */
export function PackageProgress({ total, done, booked, missed = 0, validUntil, expired }: {
  total: number; done: number; booked: number; missed?: number; validUntil?: string | null; expired?: boolean;
}) {
  const pct = (v: number) => `${Math.min(100, Math.round((v / Math.max(total, 1)) * 100))}%`;
  const left = Math.max(0, total - done - booked - missed);
  return (
    <span className="inline-flex min-w-52 flex-col gap-1 text-sm">
      <span>
        <strong>{done}</strong> of {total} used · {booked} booked
        {missed ? <> · {missed} missed</> : null}
        {left ? <> · <strong className="text-[var(--color-warn)]">{left} not booked</strong></> : null}
      </span>
      {validUntil ? (
        <span className={expired ? "font-semibold text-[var(--color-danger)]" : "text-[var(--color-ink-muted)]"}>
          {expired ? `Expired ${dayLabel(validUntil)}` : `Valid until ${dayLabel(validUntil)}`}
        </span>
      ) : null}
      <span className="relative block h-2 overflow-hidden rounded-full bg-[var(--color-line)]" role="img" aria-label={`${done} of ${total} sessions used, ${booked} booked${left ? `, ${left} not booked` : ""}`}>
        <span className="absolute inset-y-0 left-0 bg-[var(--color-brand)]" style={{ width: pct(done + missed) }} />
        <span className="absolute inset-y-0 bg-[var(--color-brand)] opacity-40" style={{ left: pct(done + missed), width: pct(booked) }} />
      </span>
    </span>
  );
}
