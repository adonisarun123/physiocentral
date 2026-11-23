import "server-only";
import { q } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertPermission, type StaffActor } from "@/modules/auth/actor";
import { therapistIdFor } from "./access";

/**
 * Clinic-wide clinical overview for the clinical lead: what needs attention
 * across every physiotherapist's caseload. Lists only names, dates and counts.
 */
export async function getClinicalOverview(actor: StaffActor) {
  assertPermission(actor, "CLINICAL_RECORDS_ALL");
  if (!(await therapistIdFor(actor))) throw new DomainError("FORBIDDEN", "Clinical lead access needs a login linked to an active physiotherapist profile.");
  const org = actor.organizationId;
  const [drafts, undocumented, overdue, noNextVisit, caseload, toReview] = await Promise.all([
    q<{ note_id: string; appointment_id: string; patient_id: string; patient: string; author_name: string; starts_at: Date; timezone: string; stale: boolean }>(
      `SELECT n.id note_id, n.appointment_id, p.id patient_id, p.full_name patient, n.author_name, a.starts_at, b.timezone,
              a.starts_at < now() - interval '24 hours' stale
         FROM clinical_note n JOIN appointment a ON a.id=n.appointment_id JOIN patient p ON p.id=n.patient_id JOIN branch b ON b.id=a.branch_id
        WHERE n.organization_id=$1 AND n.status='DRAFT' ORDER BY a.starts_at`, [org]),
    q<{ appointment_id: string; patient_id: string; patient: string; therapist: string | null; starts_at: Date; timezone: string }>(
      `SELECT a.id appointment_id, p.id patient_id, p.full_name patient, t.display_name therapist, a.starts_at, b.timezone
         FROM appointment a JOIN patient p ON p.id=a.patient_id JOIN branch b ON b.id=a.branch_id LEFT JOIN therapist t ON t.id=a.therapist_id
        WHERE a.organization_id=$1 AND a.status='COMPLETED' AND a.starts_at > now() - interval '30 days'
          AND NOT EXISTS (SELECT 1 FROM clinical_note n WHERE n.appointment_id=a.id)
        ORDER BY a.starts_at DESC LIMIT 100`, [org]),
    q<{ episode_id: string; patient_id: string; patient: string; title: string; lead: string | null; due: string }>(
      `SELECT e.id episode_id, p.id patient_id, p.full_name patient, e.title, t.display_name lead, to_char(r.next_reassessment_on,'YYYY-MM-DD') due
         FROM care_episode e JOIN patient p ON p.id=e.patient_id LEFT JOIN therapist t ON t.id=e.lead_therapist_id
         JOIN LATERAL (SELECT next_reassessment_on FROM care_plan_revision WHERE episode_id=e.id ORDER BY created_at DESC LIMIT 1) r ON true
        WHERE e.organization_id=$1 AND e.status='OPEN' AND r.next_reassessment_on <= (now() AT TIME ZONE 'Asia/Kolkata')::date
        ORDER BY r.next_reassessment_on`, [org]),
    q<{ episode_id: string; patient_id: string; patient: string; title: string; lead: string | null; last_visit: Date | null }>(
      `SELECT e.id episode_id, p.id patient_id, p.full_name patient, e.title, t.display_name lead,
              (SELECT max(starts_at) FROM appointment a WHERE a.episode_id=e.id AND a.status='COMPLETED') last_visit
         FROM care_episode e JOIN patient p ON p.id=e.patient_id LEFT JOIN therapist t ON t.id=e.lead_therapist_id
        WHERE e.organization_id=$1 AND e.status='OPEN'
          AND NOT EXISTS (SELECT 1 FROM appointment a WHERE a.patient_id=e.patient_id AND a.starts_at > now()
                           AND a.status IN ('REQUESTED','AWAITING_PATIENT_CONFIRMATION','AWAITING_DEPOSIT','CONFIRMED'))
        ORDER BY last_visit NULLS FIRST`, [org]),
    q<{ therapist_id: string; therapist: string; open_episodes: number; drafts: number; signed_30d: number }>(
      `SELECT t.id therapist_id, t.display_name therapist,
              (SELECT count(*)::int FROM care_episode e WHERE e.lead_therapist_id=t.id AND e.status='OPEN') open_episodes,
              (SELECT count(*)::int FROM clinical_note n WHERE n.author_staff_id=t.staff_member_id AND n.status='DRAFT') drafts,
              (SELECT count(*)::int FROM clinical_note n WHERE n.author_staff_id=t.staff_member_id AND n.status='SIGNED' AND n.signed_at > now() - interval '30 days') signed_30d
         FROM therapist t WHERE t.organization_id=$1 AND t.active ORDER BY t.display_name`, [org]),
    q<{ note_id: string; appointment_id: string; patient_id: string; patient: string; author_name: string; signed_at: Date }>(
      `SELECT n.id note_id, n.appointment_id, p.id patient_id, p.full_name patient, n.author_name, n.signed_at
         FROM clinical_note n JOIN patient p ON p.id=n.patient_id
        WHERE n.organization_id=$1 AND n.status='SIGNED' AND n.signed_at > now() - interval '30 days' AND n.author_staff_id <> $2
          AND NOT EXISTS (SELECT 1 FROM clinical_note_review r WHERE r.note_id=n.id AND r.reviewer_staff_id=$2)
        ORDER BY n.signed_at DESC LIMIT 100`, [org, actor.staffId]),
  ]);
  return { drafts, undocumented, overdue, noNextVisit, caseload, toReview };
}
