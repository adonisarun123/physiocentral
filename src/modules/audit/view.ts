import "server-only";
import { q } from "@/lib/db";
import { assertPermission, type StaffActor } from "@/modules/auth/actor";

/** Audit history screen (feature #10). Events never contain clinical text, so this view shows none either. */

export const AUDIT_CATEGORIES = [
  { value: "clinical", label: "Clinical records (views and changes)", prefix: "clinical." },
  { value: "billing", label: "Billing and payments", prefix: null },
  { value: "bookings", label: "Bookings", prefix: "appointment." },
  { value: "patients", label: "Patient registration", prefix: "patient." },
  { value: "staff", label: "Staff and logins", prefix: "staff." },
  { value: "all", label: "Everything", prefix: null },
] as const;

const ACTION_LABELS: Record<string, string> = {
  "clinical.chart.view": "Opened clinical record",
  "clinical.episode.view": "Opened episode of care",
  "clinical.visit.view": "Opened visit treatment notes",
  "clinical.episode.create": "Started episode of care",
  "clinical.episode.link_visit": "Filed visit under episode",
  "clinical.episode.discharge": "Discharged episode",
  "clinical.intake.record": "Recorded intake",
  "clinical.note.draft": "Saved note draft",
  "clinical.note.sign": "Signed session note",
  "clinical.note.addendum": "Added addendum",
  "clinical.note.review": "Countersigned note",
  "clinical.plan.revise": "Updated treatment plan",
  "clinical.goal.create": "Added goal",
  "clinical.goal.progress": "Recorded goal progress",
  "clinical.measurement.add": "Recorded measurement",
  "clinical.measurement.void": "Struck out measurement",
  "clinical.document.upload": "Uploaded scan / report",
  "clinical.document.view": "Opened scan / report",
  "clinical.document.remove": "Removed scan / report",
  "clinical.hep.create": "Issued home exercise sheet",
  "clinical.hep.view": "Opened home exercise sheet",
  "clinical.hep.stop": "Stopped home exercise sheet",
  "clinical.exercise.create": "Added exercise to library",
  "clinical.exercise.update": "Edited library exercise",
  "clinical.exercise.hide": "Hid library exercise",
  "clinical.exercise.restore": "Restored library exercise",
  "expense.record": "Recorded expense",
  "expense.void": "Voided expense",
  "payment.reminder": "Emailed payment reminder",
  "payment.reminder_failed": "Payment reminder failed",
  "package.validity": "Changed package validity",
  "patient.create": "Registered patient",
  "patient.update": "Edited patient details",
};
export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a.replace(/[._]/g, " ");

export interface AuditRow {
  id: string; created_at: Date; actor: string; actor_name: string | null; action: string; target_type: string;
  patient_id: string | null; patient: string | null; op_number: number | null; public_ref: string | null; reason: string | null;
}

export async function listAuditEvents(actor: StaffActor, f: { category?: string; staffId?: string; from?: string; to?: string; patientId?: string }) {
  assertPermission(actor, "AUDIT_VIEW");
  const cat = AUDIT_CATEGORIES.find((c) => c.value === f.category) ?? AUDIT_CATEGORIES[0];
  const where: string[] = ["e.organization_id=$1"];
  const params: unknown[] = [actor.organizationId];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  if (cat.value === "billing") where.push(`(e.action LIKE 'invoice.%' OR e.action LIKE 'payment.%' OR e.action LIKE 'refund.%' OR e.action LIKE 'estimate.%' OR e.action LIKE 'credit_note.%' OR e.action LIKE 'receipt.%' OR e.action LIKE 'charge.%' OR e.action LIKE 'expense.%')`);
  else if (cat.prefix) add("e.action LIKE ?", `${cat.prefix}%`);
  if (f.staffId && /^[0-9a-f-]{36}$/i.test(f.staffId)) add("e.actor = ?", `staff:${f.staffId}`);
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) add("e.created_at >= (?::date)::timestamp AT TIME ZONE 'Asia/Kolkata'", f.from);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) add("e.created_at < ((?::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')", f.to);
  const UUID = `'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`;
  // Resolve the patient behind each event so the log is readable.
  const patientSql = `CASE WHEN e.target_id ~* ${UUID} THEN CASE e.target_type
      WHEN 'patient' THEN e.target_id::uuid
      WHEN 'clinical_note' THEN (SELECT patient_id FROM clinical_note WHERE id=e.target_id::uuid)
      WHEN 'care_episode' THEN (SELECT patient_id FROM care_episode WHERE id=e.target_id::uuid)
      WHEN 'care_goal' THEN (SELECT ce.patient_id FROM care_goal g JOIN care_episode ce ON ce.id=g.episode_id WHERE g.id=e.target_id::uuid)
      WHEN 'assessment_measurement' THEN (SELECT ce.patient_id FROM assessment_measurement m JOIN care_episode ce ON ce.id=m.episode_id WHERE m.id=e.target_id::uuid)
      WHEN 'intake_submission' THEN (SELECT patient_id FROM intake_submission WHERE id=e.target_id::uuid)
      WHEN 'appointment' THEN (SELECT patient_id FROM appointment WHERE id=e.target_id::uuid)
      WHEN 'invoice' THEN (SELECT patient_id FROM invoice WHERE id=e.target_id::uuid)
      WHEN 'payment' THEN (SELECT patient_id FROM payment WHERE id=e.target_id::uuid)
      ELSE NULL END END`;
  if (f.patientId && /^[0-9a-f-]{36}$/i.test(f.patientId)) add(`(${patientSql}) = ?::uuid`, f.patientId);
  return q<AuditRow>(
    `SELECT e.id::text, e.created_at, e.actor, s.display_name actor_name, e.action, e.target_type, x.pid::text patient_id,
            p.full_name patient, p.op_number, p.public_ref, e.reason
       FROM audit_event e
       LEFT JOIN staff_member s ON e.actor = 'staff:' || s.id::text
       LEFT JOIN LATERAL (SELECT ${patientSql} pid) x ON true
       LEFT JOIN patient p ON p.id = x.pid
      WHERE ${where.join(" AND ")}
      ORDER BY e.created_at DESC, e.id DESC LIMIT 300`, params);
}

export async function auditStaffOptions(actor: StaffActor) {
  assertPermission(actor, "AUDIT_VIEW");
  return q<{ id: string; display_name: string }>(`SELECT id, display_name FROM staff_member WHERE organization_id=$1 ORDER BY display_name`, [actor.organizationId]);
}
