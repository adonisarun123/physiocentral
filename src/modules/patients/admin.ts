import { tx, q, q1 } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit } from "@/modules/audit";
import { assertPermission, type Actor, type StaffActor } from "@/modules/auth/actor";
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
  assertClinicalFieldsAllowed(actor, prof);
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

/**
 * Diagnosis and treatment protocol are clinical (feature #10): contact
 * permissions alone cannot write them. New clinical detail belongs in an
 * episode of care; these two columns are kept as the pre-episode history.
 */
function assertClinicalFieldsAllowed(actor: StaffActor, prof: { diagnosis: string | null; treatmentProtocol: string | null }) {
  if ((prof.diagnosis || prof.treatmentProtocol) && !actor.permissions.has("CLINICAL_NOTES_WRITE")) {
    throw new DomainError("FORBIDDEN", "Diagnosis and treatment protocol can only be recorded by a treating physiotherapist.");
  }
}

export async function updatePatient(actor: Actor, input: PatientInput & { patientId: string }, correlationId: string) {
  assertPermission(actor, "PATIENT_CONTACT_VIEW");
  const { name, phone, email } = check(input);
  const prof = checkProfile(input);
  // Leaving the clinical fields out keeps whatever is stored; sending them is a clinical edit.
  const clinicalEdit = input.diagnosis !== undefined || input.treatmentProtocol !== undefined;
  if (clinicalEdit) assertPermission(actor, "CLINICAL_NOTES_WRITE");
  return tx(async (db) => {
    const p = await q1<{ id: string }>(`SELECT id FROM patient WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [input.patientId, actor.organizationId], db);
    if (!p) throw new DomainError("NOT_FOUND", "Patient not found.");
    // The age entered is the age today, so the recorded-on date moves with it.
    await q(
      `UPDATE patient SET full_name=$2, age_years=$3, age_recorded_on=CASE WHEN $3::int IS NULL THEN NULL ELSE current_date END,
              sex=$4, address=$5,
              diagnosis=CASE WHEN $8 THEN $6 ELSE diagnosis END, treatment_protocol=CASE WHEN $8 THEN $7 ELSE treatment_protocol END,
              updated_at=now() WHERE id=$1`,
      [p.id, name, prof.age, prof.sex, prof.address, prof.diagnosis, prof.treatmentProtocol, clinicalEdit], db);
    // Keep history simple: replace the preferred phone/email values.
    await q(`DELETE FROM patient_contact WHERE patient_id=$1`, [p.id], db);
    await q(`INSERT INTO patient_contact (patient_id, kind, value, preferred) VALUES ($1,'PHONE',$2,true)`, [p.id, phone], db);
    if (email) await q(`INSERT INTO patient_contact (patient_id, kind, value) VALUES ($1,'EMAIL',$2)`, [p.id, email], db);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "patient.update", targetType: "patient", targetId: p.id, changes: { fields: ["name", "phone", "email", "age", "sex", "address", ...(clinicalEdit ? ["diagnosis", "treatment_protocol"] : [])] }, correlationId });
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

export interface ExistingMatch { request_patient_id: string; id: string; full_name: string; op_number: number; public_ref: string }

/**
 * An online request always starts a fresh patient record (the channel is
 * unverified). This finds patients already on the books with the same mobile,
 * so staff can attach the request to them instead of creating a second record
 * and a second OP number. A shared phone is common in families, so it is only
 * ever a suggestion for staff to confirm.
 */
export async function existingPatientMatches(orgId: string, requestPatientIds: string[]) {
  if (!requestPatientIds.length) return [];
  return q<ExistingMatch>(
    `SELECT DISTINCT rc.patient_id request_patient_id, p.id, p.full_name, p.op_number, p.public_ref
       FROM patient_contact rc
       JOIN patient_contact c ON c.kind='PHONE' AND c.value=rc.value AND c.patient_id <> rc.patient_id
       JOIN patient p ON p.id=c.patient_id AND p.organization_id=$1 AND NOT p.archived AND p.op_number IS NOT NULL
      WHERE rc.kind='PHONE' AND rc.patient_id = ANY($2::uuid[])
      ORDER BY p.op_number`,
    [orgId, requestPatientIds],
  );
}

/**
 * Attach a pending online request to a patient who is already registered.
 * Only while the request is still unconfirmed, and only when the record the
 * request created has nothing else on it; that record is then archived.
 */
export async function attachRequestToPatient(actor: Actor, input: { appointmentId: string; expectedVersion: number; patientId: string }, correlationId: string) {
  assertPermission(actor, "APPOINTMENT_ACCEPT");
  assertPermission(actor, "PATIENT_CONTACT_VIEW");
  return tx(async (db) => {
    const appt = await q1<{ id: string; status: string; version: number; patient_id: string }>(
      `SELECT id, status, version, patient_id FROM appointment WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [input.appointmentId, actor.organizationId], db);
    if (!appt) throw new DomainError("NOT_FOUND", "Appointment not found.");
    if (appt.version !== input.expectedVersion) throw new DomainError("STALE_VERSION", "This appointment was changed by someone else. Reload to see the latest version.");
    if (appt.status !== "REQUESTED") throw new DomainError("INVALID_TRANSITION", "Only a request that has not been confirmed yet can be moved to another patient record.");
    if (appt.patient_id === input.patientId) throw new DomainError("VALIDATION", "This request is already on that patient's record.");
    // Lock both records in id order so two staff doing this at once cannot deadlock.
    const locked = await q<{ id: string; full_name: string; archived: boolean; op_number: number | null; public_ref: string }>(
      `SELECT id, full_name, archived, op_number, public_ref FROM patient WHERE id = ANY($1::uuid[]) AND organization_id=$2 ORDER BY id FOR UPDATE`,
      [[appt.patient_id, input.patientId], actor.organizationId], db);
    const fresh = locked.find((p) => p.id === appt.patient_id);
    const target = locked.find((p) => p.id === input.patientId);
    if (!fresh || !target || target.archived) throw new DomainError("NOT_FOUND", "Patient not found.");
    const used = (await q1<{ n: string }>(
      `SELECT ((SELECT count(*) FROM appointment WHERE patient_id=$1 AND id <> $2) + (SELECT count(*) FROM payment WHERE patient_id=$1)
             + (SELECT count(*) FROM invoice WHERE patient_id=$1) + (SELECT count(*) FROM estimate WHERE patient_id=$1)
             + (SELECT count(*) FROM billable_charge WHERE patient_id=$1) + (SELECT count(*) FROM patient_package WHERE patient_id=$1))::text n`,
      [fresh.id, appt.id], db))!;
    if (fresh.op_number != null || used.n !== "0") {
      throw new DomainError("INVALID_TRANSITION", "The record this request came in on already has visits or bills of its own, so it cannot be merged from here.");
    }
    await q(`UPDATE appointment SET patient_id=$2, version=version+1, updated_at=now() WHERE id=$1`, [appt.id, target.id], db);
    // The privacy acknowledgement and contact consents given with this request belong to the person, so they move too.
    await q(`UPDATE consent_record SET patient_id=$2 WHERE patient_id=$1`, [fresh.id, target.id], db);
    await q(`UPDATE patient SET archived=true, updated_at=now() WHERE id=$1`, [fresh.id], db);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "appointment.use_existing_patient", targetType: "appointment", targetId: appt.id,
      changes: { fromPatient: fresh.id, toPatient: target.id }, correlationId });
    return { patientName: target.full_name, patientNumber: patientNumber(target) };
  });
}
