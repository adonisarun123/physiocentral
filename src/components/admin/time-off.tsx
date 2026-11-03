import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatDateTime, todayInZone } from "@/lib/format";
import { addTimeOffAction, removeTimeOffAction } from "@/app/(staff)/admin/actions";

export interface TimeOffRow { id: string; lo: Date; hi: Date; reason: string; who: string | null }

const MIDNIGHT = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d) === "00:00";
const dateOnly = (d: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d);

export function describeRange(lo: Date, hi: Date) {
  if (MIDNIGHT(lo) && MIDNIGHT(hi)) {
    const last = new Date(new Date(hi).getTime() - 1);
    const a = dateOnly(lo), b = dateOnly(last);
    return a === b ? `${a} (all day)` : `${a} → ${b} (all day)`;
  }
  return `${formatDateTime(lo)} → ${formatDateTime(hi)}`;
}

/** List + add form for leave (therapistId set) or clinic closures (therapistId null). */
export function TimeOff({ rows, therapistId, showWho }: { rows: TimeOffRow[]; therapistId: string | null; showWho?: boolean }) {
  return (
    <div>
      {rows.length ? (
        <ul className="divide-y divide-[var(--color-line)]">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><span className="font-semibold">{describeRange(r.lo, r.hi)}</span> · {r.reason}{showWho && r.who ? ` · ${r.who}` : ""}</span>
              <ActionForm action={removeTimeOffAction} confirm="Remove this block? Those times become bookable again.">
                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="therapistId" value={therapistId ?? ""} />
                <SubmitButton small variant="secondary">Remove</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-[var(--color-ink-muted)]">Nothing upcoming.</p>}
      <ActionForm action={addTimeOffAction} className="mt-4 rounded-lg bg-[var(--color-surface-alt)] p-4">
        <input type="hidden" name="therapistId" value={therapistId ?? ""} />
        <p className="font-semibold">{therapistId ? "Add leave" : "Add a holiday or closure"}</p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div><label className="field-label" htmlFor={`fd-${therapistId}`}>From date</label><input id={`fd-${therapistId}`} name="fromDate" type="date" required min={todayInZone()} className="input" /></div>
          <div><label className="field-label" htmlFor={`td-${therapistId}`}>To date (blank = same day)</label><input id={`td-${therapistId}`} name="toDate" type="date" min={todayInZone()} className="input" /></div>
          <div><label className="field-label" htmlFor={`ft-${therapistId}`}>From time (optional)</label><input id={`ft-${therapistId}`} name="fromTime" type="time" step={900} className="input" /></div>
          <div><label className="field-label" htmlFor={`tt-${therapistId}`}>To time</label><input id={`tt-${therapistId}`} name="toTime" type="time" step={900} className="input" /></div>
          <div className="min-w-48 flex-1"><label className="field-label" htmlFor={`rs-${therapistId}`}>Reason</label><input id={`rs-${therapistId}`} name="reason" required className="input" placeholder={therapistId ? "Annual leave" : "Diwali"} /></div>
          <SubmitButton small>Block time</SubmitButton>
        </div>
        <p className="field-hint mt-1">Leave times blank to block whole days.</p>
      </ActionForm>
    </div>
  );
}
