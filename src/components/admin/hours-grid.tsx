import { WEEKDAYS } from "@/lib/format";

export interface ShiftRow { weekday: number; start: string; end: string }

/** Weekly hours editor: up to two shifts per day (e.g. 9–1 and 4–8). Blank = day off. */
export function HoursGrid({ shifts, idPrefix }: { shifts: ShiftRow[]; idPrefix: string }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[var(--color-ink-muted)]">
          <th className="py-1 pr-2 font-semibold">Day</th>
          <th className="py-1 pr-2 font-semibold">Shift 1</th>
          <th className="py-1 font-semibold">Shift 2 (optional)</th>
        </tr>
      </thead>
      <tbody>
        {order.map((d) => {
          const day = shifts.filter((s) => s.weekday === d).sort((a, b) => a.start.localeCompare(b.start));
          return (
            <tr key={d} className="border-t border-[var(--color-line)]">
              <th scope="row" className="py-2 pr-2 text-left font-medium">{WEEKDAYS[d]}</th>
              {[1, 2].map((k) => (
                <td key={k} className="py-2 pr-2">
                  <span className="flex flex-wrap items-center gap-1">
                    <input aria-label={`${WEEKDAYS[d]} shift ${k} start`} id={`${idPrefix}-d${d}s${k}`} name={`d${d}s${k}`} type="time" step={900} defaultValue={day[k - 1]?.start ?? ""} className="input w-[9rem] py-1" />
                    <span aria-hidden>–</span>
                    <input aria-label={`${WEEKDAYS[d]} shift ${k} end`} name={`d${d}e${k}`} type="time" step={900} defaultValue={day[k - 1]?.end ?? ""} className="input w-[9rem] py-1" />
                  </span>
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const CLINIC_DEFAULT_SHIFTS: ShiftRow[] = [1, 2, 3, 4, 5, 6].flatMap((d) => [
  { weekday: d, start: "09:00", end: "13:00" },
  { weekday: d, start: "16:00", end: "20:00" },
]);
