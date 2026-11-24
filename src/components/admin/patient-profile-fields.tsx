import { SEX_OPTIONS } from "@/modules/patients/admin";

/** Age / sex / address — used on registration and on the patient record. Clinical detail lives in the chart. */
export function PatientProfileFields({ idPrefix, values = {}, compact = false }: {
  idPrefix: string;
  values?: { age?: number | null; sex?: string | null; address?: string | null };
  compact?: boolean;
}) {
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <div><label className="field-label" htmlFor={id("age")}>Age</label>
          <input id={id("age")} name="age" type="number" min={0} max={120} step={1} inputMode="numeric" defaultValue={values.age ?? ""} className="input" /></div>
        <div><label className="field-label" htmlFor={id("sex")}>Sex</label>
          <select id={id("sex")} name="sex" defaultValue={values.sex ?? ""} className="input">
            <option value="">—</option>
            {SEX_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select></div>
      </div>
      <div><label className="field-label" htmlFor={id("address")}>Address</label>
        <textarea id={id("address")} name="address" rows={2} maxLength={500} defaultValue={values.address ?? ""} className="input" /></div>
    </div>
  );
}
