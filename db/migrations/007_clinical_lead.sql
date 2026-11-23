-- 007_clinical_lead.sql
-- 1) CLINICAL_LEAD role: the clinic's clinical head (Dr Nitin) can open every
--    patient's clinical record, not only patients they treat. Granted only to
--    a login linked to a physiotherapist profile (enforced in the service).
-- 2) clinical_note_review: the lead countersigns a colleague's signed note.
--    The note itself is never edited; the review is append-only.
-- 3) Index for the audit history screen.

ALTER TABLE role_grant DROP CONSTRAINT IF EXISTS role_grant_role_check;
ALTER TABLE role_grant ADD CONSTRAINT role_grant_role_check
  CHECK (role IN ('OWNER','CLINIC_ADMIN','RECEPTIONIST','PHYSIOTHERAPIST','BILLING','ACCOUNTANT','CONTENT_EDITOR','CLINICAL_LEAD'));

CREATE TABLE IF NOT EXISTS clinical_note_review (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id            uuid NOT NULL REFERENCES clinical_note(id),
  reviewer_staff_id  uuid NOT NULL REFERENCES staff_member(id),
  reviewer_name      text NOT NULL,
  comment            text CHECK (char_length(comment) <= 1000),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, reviewer_staff_id)
);
CREATE TRIGGER clinical_note_review_append_only BEFORE UPDATE OR DELETE ON clinical_note_review
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE INDEX IF NOT EXISTS audit_event_org_time ON audit_event (organization_id, created_at DESC);
