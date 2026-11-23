import { tx, q, q1 } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit } from "@/modules/audit";
import { assertPermission, type Actor } from "@/modules/auth/actor";
import { publicRef } from "@/lib/security/tokens";
import { parseOpNumber, patientNumber } from "@/lib/format";
import { normalizeIndianPhone } from "./contact";

export const SEX_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
] as const;
export type Sex = (typeof SEX_OPTIONS)[number]["value"];

/** Registration details beyond contact info. All optional so a quick phone booking is never blocked. */
export interface PatientProfileInput {
  age?: string | number | null;
  sex?: string | null;
  address?: string | null;
  diagnosis?: string | null;
  treatmentProtocol?: string | null;
}

export interface PatientInput extends PatientProfileInput { fullName: string; phone: string; email?: string; isNewPatient?: boolean | null }

const clip = (v: string | null | undefined, max: number, label: string, field: string) => {
  const t = (v ?? "").trim();
  if (t.length > max) throw new DomainError("VALIDATION", `${label} is too long (max ${max} characters).`, { [field]: "Too long" });
  return t || null;
};

export function checkProfile(input: PatientProfileInput) {
  const rawAge = String(input.age ?? "").trim();
  let age: number | null = null;
  if (rawAge) {
    age = Number(rawAge);
    if (!Number.isInteger(age) || age < 0 || age > 120) throw new DomainError("VALIDATION", "Enter the age in whole years (0–120).", { age: "Invalid" });
  }
  const rawSex = (input.sex ?? "").trim().toUpperCase();
  if (rawSex && !SEX_OPTIONS.some((o) => o.value === rawSex)) throw new DomainError("VALIDATION", "Choose the patient's sex.", { sex: "Invalid" });
  return {
    age,
    sex: (rawSex || null) as Sex | null,
    address: clip(input.address, 500, "Address", "address"),
    diagnosis: clip(input.diagnosis, 2000, "Diagnosis", "diagnosis"),
    treatmentProtocol: clip(input.treatmentProtocol, 4000, "Treatment protocol", "treatmentProtocol"),
  };
}

function check(input: PatientInput) {
  const name = input.fullName.trim();
  if (name.length < 2) throw new DomainError("VALIDATION", "Enter the patient's name.", { fullName: "Required" });
  const phone = normalizeIndianPhone(input.phone);
  if (!phone) throw new DomainError("VALIDATION", "Enter a valid phone number, e.g. 98765 43210.", { phone: "Invalid" });
  const email = (input.email ?? "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError("VALIDATION", "Enter a valid email or leave it blank.", { email: "Invalid" });
  return { name, phone, email };
}

/**
 * Staff-registered patient (phone / front desk). Refuses an exact phone match
 * unless `allowDuplicate` — the usual case is the person already exists
 * (e.g. from an online request) and staff should use that record.
 */
export async function createPatient(actor: Actor, input: PatientInput & { allowDuplicate?: boolean }, correlationId: string) {
  assertPermission(actor, "PATIENT_CONTACT_VIEW");
  const { name, phone, email } = check(input);
  const prof = checkProfile(input);
  return tx(async (db) => {
    if (!input.allowDuplicate) {
      const dupe = await q1<{ id: string; full_name: string; public_ref: string; op_number: number | null }>(
        `SELECT p.id, p.full_name, p.public_ref, p.op_number FROM patient p JOIN patient_contact c ON c.patient_id=p.id
          WHERE p.organization_id=$1 AND NOT p.archived AND c.kind='PHONE' AND c.value=$2 ORDER BY p.created_at LIMIT 1`,
        [actor.organizationId, phone], db);
      if (dupe) {
        throw new DomainError("DUPLICATE", `${dupe.full_name} (${patientNumber(dupe)}) already has this phone number. Open their record, or tick "create anyway" for a different person (e.g. a family member).`);
      }
    }
    const p = (await q1<{ id: string }>(
      `INSERT INTO patient (organization_id, public_ref, full_name, is_new_patient, identity_verified,
         age_years, age_recorded_on, sex, address, diagnosis, treatment_protocol)
       VALUES ($1,$2,$3,$4,false,$5,CASE WHEN $5::int IS NULL THEN NULL ELSE current_date END,$6,$7,$8,$9) RETURNING id`,
      [actor.organizationId, publicRef("PT"), name, input.isNewPatient ?? null, prof.age, prof.sex, prof.address, prof.diagnosis, prof.treatmentProtocol], db))!;
    // Registered at the front desk, so they are a real patient: give them their OP number now.
    await q(`SELECT assign_op_number($1)`, [p.id], db);
    await q(`INSERT INTO patient_contact (patient_id, kind, value, preferred) VALUES ($1,'PHONE',$2,true)`, [p.id, phone], db);
    if (email) await q(`INSERT INTO patient_contact (patient_id, kind, value) VALUES ($1,'EMAIL',$2)`, [p.id, email], db);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "patient.create", targetType: "patient", targetId: p.id, changes: { source: "staff" }, correlationId });
    return { patientId: p.id };
  });
}

export async function updatePatient(actor: Actor, input: PatientInput & { patientId: string }, correlationId: string) {
  assertPermission(actor, "PATIENT_CONTACT_VIEW");
  const { name, phone, email } = check(input);
  const prof = checkProfile(input);
  return tx(async (db) => {
    const p = await q1<{ id: string }>(`SELECT id FROM patient WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [input.patientId, actor.organizationId], db);
    if (!p) throw new DomainError("NOT_FOUND", "Patient not found.");
    // The age entered is the age today, so the recorded-on date moves with it.
    await q(
      `UPDATE patient SET full_name=$2, age_years=$3, age_recorded_on=CASE WHEN $3::int IS NULL THEN NULL ELSE current_date END,
              sex=$4, address=$5, diagnosis=$6, treatment_protocol=$7, updated_at=now() WHERE id=$1`,
      [p.id, name, prof.age, prof.sex, prof.address, prof.diagnosis, prof.treatmentProtocol], db);
    // Keep history simple: replace the preferred phone/email values.
    await q(`DELETE FROM patient_contact WHERE patient_id=$1`, [p.id], db);
    await q(`INSERT INTO patient_contact (patient_id, kind, value, preferred) VALUES ($1,'PHONE',$2,true)`, [p.id, phone], db);
    if (email) await q(`INSERT INTO patient_contact (patient_id, kind, value) VALUES ($1,'EMAIL',$2)`, [p.id, email], db);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "patient.update", targetType: "patient", targetId: p.id, changes: { fields: ["name", "phone", "email", "age", "sex", "address", "diagnosis", "treatment_protocol"] }, correlationId });
  });
}

export interface PatientHit { id: string; public_ref: string; op_number: number | null; full_name: string; phone: string | null; last_visit: Date | null; created_at: Date }

/** Search by name, OP number ("OP-0027", "op 27" or just "27"), old reference or phone digits. */
export async function searchPatients(orgId: string, term: string, limit = 25) {
  const t = term.trim();
  const digits = t.replace(/\D/g, "");
  return q<PatientHit>(
    `SELECT p.id, p.public_ref, p.op_number, p.full_name,
            (SELECT value FROM patient_contact c WHERE c.patient_id=p.id AND c.kind='PHONE' ORDER BY preferred DESC LIMIT 1) phone,
            (SELECT max(starts_at) FROM appointment a WHERE a.patient_id=p.id) last_visit, p.created_at
       FROM patient p
      WHERE p.organization_id=$1 AND NOT p.archived
        AND ($2 = '' OR p.full_name ILIKE '%'||$2||'%' OR p.public_ref ILIKE '%'||$2||'%' OR p.op_number = $5::int
             OR (length($3) >= 4 AND EXISTS (SELECT 1 FROM patient_contact c WHERE c.patient_id=p.id AND c.kind='PHONE' AND regexp_replace(c.value,'\\D','','g') LIKE '%'||$3||'%')))
      ORDER BY (p.op_number IS NOT DISTINCT FROM $5::int AND $5::int IS NOT NULL) DESC, GREATEST(p.created_at, COALESCE((SELECT max(updated_at) FROM appointment a WHERE a.patient_id=p.id), p.created_at)) DESC
      LIMIT $4`,
    [orgId, t, digits, limit, parseOpNumber(t)],
  );
}

/** Age now, from the age recorded at registration (no date of birth is collected). */
export const CURRENT_AGE_SQL = `CASE WHEN p.age_years IS NULL THEN NULL
  ELSE p.age_years + EXTRACT(YEAR FROM age(current_date, COALESCE(p.age_recorded_on, current_date)))::int END`;

export function sexLabel(v: string | null | undefined) {
  return SEX_OPTIONS.find((o) => o.value === v)?.label ?? null;
}
