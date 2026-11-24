import { q1, type Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertPermission, type Actor, type StaffActor } from "@/modules/auth/actor";

/**
 * Who may open a patient's clinical record (feature #10).
 *  - the CLINICAL_NOTES_READ / _WRITE permission, checked on the server, and
 *  - membership of the patient's care team: the staff login is linked to a
 *    therapist who has been assigned one of the patient's visits, or who leads
 *    one of their episodes, or
 *  - CLINICAL_RECORDS_ALL (the clinical lead), which covers every patient. It
 *    counts only while the login is linked to an active therapist profile, so
 *    every clinical action is still attributable to a clinician.
 * Contact permissions (reception) and clinic ownership grant nothing here.
 */
export type ClinicalPerm = "CLINICAL_NOTES_READ" | "CLINICAL_NOTES_WRITE";

export interface CareTeamPatient {
  therapistId: string;
  patient: { id: string; full_name: string; op_number: number | null; public_ref: string };
}

export async function therapistIdFor(actor: StaffActor, db?: Db): Promise<string | null> {
  const t = await q1<{ id: string }>(
    `SELECT id FROM therapist WHERE staff_member_id=$1 AND organization_id=$2 AND active`, [actor.staffId, actor.organizationId], db);
  return t?.id ?? null;
}

async function careTeamRow(actor: StaffActor, patientId: string, therapistId: string, db?: Db) {
  return q1<{ id: string; full_name: string; op_number: number | null; public_ref: string; on_team: boolean }>(
    `SELECT p.id, p.full_name, p.op_number, p.public_ref,
            ($4::boolean OR EXISTS (SELECT 1 FROM appointment a WHERE a.patient_id=p.id AND a.therapist_id=$3 AND a.status <> 'REJECTED')
             OR EXISTS (SELECT 1 FROM care_episode e WHERE e.patient_id=p.id AND e.lead_therapist_id=$3)) on_team
       FROM patient p WHERE p.id=$1 AND p.organization_id=$2`,
    [patientId, actor.organizationId, therapistId, actor.permissions.has("CLINICAL_RECORDS_ALL")], db);
}

export async function assertCareTeam(actor: Actor, patientId: string, perm: ClinicalPerm, db?: Db): Promise<CareTeamPatient & { actor: StaffActor }> {
  assertPermission(actor, perm);
  if (!/^[0-9a-f-]{36}$/i.test(patientId)) throw new DomainError("NOT_FOUND", "Patient not found.");
  const therapistId = await therapistIdFor(actor, db);
  if (!therapistId) throw new DomainError("FORBIDDEN", "Clinical records open only for a physiotherapist whose login is linked to their therapist profile.");
  const row = await careTeamRow(actor, patientId, therapistId, db);
  if (!row) throw new DomainError("NOT_FOUND", "Patient not found.");
  if (!row.on_team) throw new DomainError("FORBIDDEN", "Only physiotherapists assigned to this patient's care can open their clinical record.");
  const { on_team: _ignored, ...patient } = row;
  void _ignored;
  return { therapistId, patient, actor };
}

/** Non-throwing check for deciding whether to show clinical UI. */
export async function canOpenChart(actor: StaffActor, patientId: string, perm: ClinicalPerm = "CLINICAL_NOTES_READ"): Promise<boolean> {
  if (!actor.permissions.has(perm)) return false;
  const therapistId = await therapistIdFor(actor);
  if (!therapistId) return false;
  return !!(await careTeamRow(actor, patientId, therapistId))?.on_team;
}
