import { Check, Clock, CalendarCheck, ShieldCheck, Lock } from "lucide-react";

/**
 * Illustrative UI mock-ups for marketing panels (judge.me-style). They depict
 * the app's real flows with generic sample data and are hidden from assistive
 * tech so they are never mistaken for live information.
 */
export function BookingMock() {
  return (
    <div className="mock w-[min(100%,20rem)] p-5" aria-hidden="true">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">Step 2 of 4</p>
      <p className="font-display mt-1 text-lg font-semibold">Choose a time</p>
      <div className="mt-3 rounded-xl bg-[var(--color-surface-alt)] p-3 text-sm">
        <p className="font-semibold">Initial assessment</p>
        <p className="flex items-center gap-1 text-[var(--color-ink-muted)]"><Clock size={14} /> About 60 minutes</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {["9:00", "9:45", "10:30", "11:15", "4:00", "4:45"].map((t, i) => (
          <span key={t} className={`rounded-lg border px-2 py-1.5 text-center font-semibold ${i === 2 ? "border-[var(--color-ink)] bg-[var(--color-mint)]" : "border-[var(--color-line)]"}`}>{t}</span>
        ))}
      </div>
      <p className="mt-4 rounded-lg bg-[var(--color-ink)] py-2 text-center text-sm font-semibold text-white">Continue</p>
    </div>
  );
}

export function AssessmentMock() {
  const items = ["Your goals and history", "Movement and strength tests", "What's driving the pain", "A plan you agree on"];
  return (
    <div className="mock w-[min(100%,19rem)] p-5" aria-hidden="true">
      <p className="font-display text-lg font-semibold">Your first visit</p>
      <ul className="mt-3 space-y-2.5 text-sm">
        {items.map((t) => (
          <li key={t} className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-brand-soft)] text-[var(--color-brand)]"><Check size={14} /></span>
            {t}
          </li>
        ))}
      </ul>
      <div className="mt-4 h-2 rounded-full bg-[var(--color-surface-alt)]"><div className="h-2 w-3/4 rounded-full bg-[var(--color-mint-strong)]" /></div>
    </div>
  );
}

export function EstimateMock() {
  return (
    <div className="mock w-[min(100%,20rem)] p-5" aria-hidden="true">
      <p className="font-display text-lg font-semibold">Cost estimate</p>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between"><span>Treatment session</span><span className="font-semibold">₹ ••••</span></div>
        <div className="flex justify-between"><span>Support taping <span className="ml-1 rounded bg-[var(--color-warn-soft)] px-1 text-xs">Extra</span></span><span className="font-semibold">₹ •••</span></div>
        <div className="flex justify-between border-t border-[var(--color-line)] pt-2 font-semibold"><span>Total payable</span><span>₹ ••••</span></div>
      </div>
      <div className="mt-4 flex gap-2 text-sm">
        <span className="flex-1 rounded-lg bg-[var(--color-mint)] py-2 text-center font-semibold">Accept</span>
        <span className="flex-1 rounded-lg border border-[var(--color-line)] py-2 text-center font-semibold">Decline</span>
      </div>
    </div>
  );
}

export function StatusMock() {
  return (
    <div className="mock w-[min(100%,19rem)] p-5" aria-hidden="true">
      <p className="flex items-center gap-1 text-xs text-[var(--color-ink-muted)]"><Lock size={12} /> Private link</p>
      <p className="font-display mt-1 text-lg font-semibold">Your appointment</p>
      <p className="mt-1 font-mono text-xs text-[var(--color-ink-muted)]">PC-7KQ2-M9XD</p>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--color-ok-soft)] p-3 text-sm font-semibold text-[var(--color-ok)]">
        <CalendarCheck size={18} /> Confirmed
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm text-[var(--color-ink-muted)]"><ShieldCheck size={16} /> Only you can see this page</div>
      <p className="mt-4 rounded-lg border border-[var(--color-line)] py-2 text-center text-sm font-semibold">Cancel or call to reschedule</p>
    </div>
  );
}
