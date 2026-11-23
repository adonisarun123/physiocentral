-- 006_clinical_record.sql — the clinical record behind the return-visit workflow.
--   care_episode            one problem being treated (knee rehab, shoulder …) under the patient's OP number
--   intake_submission       pre-visit / reception intake, one row per submission key
--   clinical_note           SOAP note per appointment; frozen once signed
--   clinical_note_addendum  dated, attributed corrections to a signed note (append-only)
--   care_plan_revision      frequency / interventions / next reassessment, history kept (append-only)
--   care_goal + progress    functional goals with baseline and dated progress (progress append-only)
--   assessment_measurement  pain, ROM, strength … with region, side, unit and scale
-- Clinical narrative never goes into audit_event or outbox_event payloads.

-- ───────────── Episodes of care ─────────────
CREATE TABLE IF NOT EXISTS care_episode (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  patient_id         uuid NOT NULL,
  title              text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  body_region        text CHECK (char_length(body_region) <= 40),
  side               text CHECK (side IN ('LEFT','RIGHT','BILATERAL','NOT_APPLICABLE')),
  working_diagnosis  text CHECK (char_length(working_diagnosis) <= 2000),
  referrer           text CHECK (char_length(referrer) <= 200),
  lead_therapist_id  uuid REFERENCES therapist(id),
  status             text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DISCHARGED')),
  opened_on          date NOT NULL,
  closed_on          date,
  discharge_summary  text CHECK (char_length(discharge_summary) <= 4000),
  -- Pre-episode diagnosis / protocol text, attached here by a therapist after review.
  legacy_summary     text CHECK (char_length(legacy_summary) <= 6100),
  legacy_reviewed_by text,
  created_by         text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'DISCHARGED') = (closed_on IS NOT NULL)),
  CHECK (closed_on IS NULL OR closed_on >= opened_on),
  UNIQUE (id, organization_id),
  UNIQUE (id, patient_id),
  FOREIGN KEY (patient_id, organization_id) REFERENCES patient(id, organization_id)
);
CREATE INDEX IF NOT EXISTS care_episode_patient ON care_episode (patient_id, status, opened_on DESC);

-- Optional link from a visit to its episode. The composite key makes it
-- impossible to file a visit under another patient's episode.
ALTER TABLE appointment ADD COLUMN IF NOT EXISTS episode_id uuid;
ALTER TABLE appointment ADD CONSTRAINT appointment_episode_same_patient
  FOREIGN KEY (episode_id, patient_id) REFERENCES care_episode(id, patient_id);
CREATE INDEX IF NOT EXISTS appointment_episode ON appointment (episode_id) WHERE episode_id IS NOT NULL;

-- ───────────── Intake ─────────────
CREATE TABLE IF NOT EXISTS intake_submission (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  patient_id         uuid NOT NULL,
  episode_id         uuid,
  appointment_id     uuid REFERENCES appointment(id),
  submission_key     text NOT NULL CHECK (char_length(submission_key) BETWEEN 8 AND 100),
  main_concern       text NOT NULL CHECK (char_length(main_concern) BETWEEN 2 AND 1000),
  relevant_history   text CHECK (char_length(relevant_history) <= 3000),
  patient_goal       text CHECK (char_length(patient_goal) <= 500),
  referrer           text CHECK (char_length(referrer) <= 200),
  preferred_language text CHECK (char_length(preferred_language) <= 40),
  treatment_consent  boolean NOT NULL,
  channel            text NOT NULL CHECK (channel IN ('RECEPTION','PATIENT_LINK','PATIENT_PORTAL')),
  submitted_by       text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, submission_key),
  FOREIGN KEY (patient_id, organization_id) REFERENCES patient(id, organization_id),
  FOREIGN KEY (episode_id, patient_id) REFERENCES care_episode(id, patient_id)
);
CREATE INDEX IF NOT EXISTS intake_submission_patient ON intake_submission (patient_id, created_at DESC);
CREATE TRIGGER intake_submission_append_only BEFORE UPDATE OR DELETE ON intake_submission
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ───────────── Session notes ─────────────
CREATE TABLE IF NOT EXISTS clinical_note (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL,
  patient_id        uuid NOT NULL,
  episode_id        uuid NOT NULL,
  appointment_id    uuid NOT NULL UNIQUE REFERENCES appointment(id),
  author_staff_id   uuid NOT NULL REFERENCES staff_member(id),
  author_name       text NOT NULL,
  status            text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SIGNED')),
  subjective        text CHECK (char_length(subjective) <= 4000),
  objective         text CHECK (char_length(objective) <= 4000),
  assessment        text CHECK (char_length(assessment) <= 4000),
  plan              text CHECK (char_length(plan) <= 4000),
  interventions     text CHECK (char_length(interventions) <= 2000),
  patient_response  text CHECK (char_length(patient_response) <= 2000),
  version           int NOT NULL DEFAULT 1,
  signed_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'SIGNED') = (signed_at IS NOT NULL)),
  FOREIGN KEY (patient_id, organization_id) REFERENCES patient(id, organization_id),
  FOREIGN KEY (episode_id, patient_id) REFERENCES care_episode(id, patient_id)
);
CREATE INDEX IF NOT EXISTS clinical_note_episode ON clinical_note (episode_id, created_at DESC);

-- A signed note is the legal record: no edits, no deletes. Drafts can be edited, never deleted.
CREATE OR REPLACE FUNCTION guard_clinical_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Clinical notes cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'SIGNED' THEN
    RAISE EXCEPTION 'A signed clinical note cannot be changed; add an addendum' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.appointment_id <> OLD.appointment_id OR NEW.patient_id <> OLD.patient_id OR NEW.author_staff_id <> OLD.author_staff_id THEN
    RAISE EXCEPTION 'Clinical note ownership cannot be changed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clinical_note_guard BEFORE UPDATE OR DELETE ON clinical_note
  FOR EACH ROW EXECUTE FUNCTION guard_clinical_note();

CREATE TABLE IF NOT EXISTS clinical_note_addendum (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id          uuid NOT NULL REFERENCES clinical_note(id),
  author_staff_id  uuid NOT NULL REFERENCES staff_member(id),
  author_name      text NOT NULL,
  body             text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 4000),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinical_note_addendum_note ON clinical_note_addendum (note_id, created_at);
CREATE TRIGGER clinical_note_addendum_append_only BEFORE UPDATE OR DELETE ON clinical_note_addendum
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ───────────── Treatment plan ─────────────
CREATE TABLE IF NOT EXISTS care_plan_revision (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id           uuid NOT NULL REFERENCES care_episode(id),
  frequency            text CHECK (char_length(frequency) <= 200),
  interventions        text CHECK (char_length(interventions) <= 2000),
  next_reassessment_on date,
  author_staff_id      uuid NOT NULL REFERENCES staff_member(id),
  author_name          text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS care_plan_revision_episode ON care_plan_revision (episode_id, created_at DESC);
CREATE TRIGGER care_plan_revision_append_only BEFORE UPDATE OR DELETE ON care_plan_revision
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ───────────── Goals ─────────────
CREATE TABLE IF NOT EXISTS care_goal (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id       uuid NOT NULL REFERENCES care_episode(id),
  description      text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 300),
  baseline         text NOT NULL CHECK (char_length(baseline) BETWEEN 1 AND 500),
  target_on        date,
  status           text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ACHIEVED','DISCONTINUED')),
  author_staff_id  uuid NOT NULL REFERENCES staff_member(id),
  author_name      text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS care_goal_episode ON care_goal (episode_id, created_at);

-- Only the status of a goal moves; what was agreed and the baseline stay as recorded.
CREATE OR REPLACE FUNCTION guard_care_goal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Goals cannot be deleted; discontinue them' USING ERRCODE = 'P0001'; END IF;
  IF NEW.description <> OLD.description OR NEW.baseline <> OLD.baseline OR NEW.episode_id <> OLD.episode_id
     OR NEW.author_staff_id <> OLD.author_staff_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'A goal''s description and baseline cannot be changed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER care_goal_guard BEFORE UPDATE OR DELETE ON care_goal FOR EACH ROW EXECUTE FUNCTION guard_care_goal();

CREATE TABLE IF NOT EXISTS care_goal_progress (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id          uuid NOT NULL REFERENCES care_goal(id),
  appointment_id   uuid REFERENCES appointment(id),
  progress         text NOT NULL CHECK (char_length(progress) BETWEEN 2 AND 1000),
  status_after     text NOT NULL CHECK (status_after IN ('ACTIVE','ACHIEVED','DISCONTINUED')),
  author_staff_id  uuid NOT NULL REFERENCES staff_member(id),
  author_name      text NOT NULL,
  recorded_on      date NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS care_goal_progress_goal ON care_goal_progress (goal_id, created_at);
CREATE TRIGGER care_goal_progress_append_only BEFORE UPDATE OR DELETE ON care_goal_progress
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ───────────── Measurements ─────────────
-- One series = (region, side, movement, unit). A right-knee value or a value on
-- a different scale is a different series and is never compared with this one.
CREATE TABLE IF NOT EXISTS assessment_measurement (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id       uuid NOT NULL REFERENCES care_episode(id),
  appointment_id   uuid REFERENCES appointment(id),
  measured_on      date NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('PAIN','ROM','STRENGTH','FUNCTION','OTHER')),
  body_region      text NOT NULL CHECK (char_length(body_region) BETWEEN 2 AND 40),
  side             text NOT NULL CHECK (side IN ('LEFT','RIGHT','BILATERAL','NOT_APPLICABLE')),
  movement         text NOT NULL CHECK (char_length(movement) BETWEEN 2 AND 80),
  value            numeric(8,2) NOT NULL,
  unit             text NOT NULL CHECK (unit IN ('NPRS_0_10','DEGREES','MMT_0_5','KG','CM','SECONDS','REPS','SCORE')),
  observation      text CHECK (char_length(observation) <= 500),
  author_staff_id  uuid NOT NULL REFERENCES staff_member(id),
  author_name      text NOT NULL,
  voided_at        timestamptz,
  voided_by        text,
  void_reason      text CHECK (char_length(void_reason) <= 300),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((voided_at IS NULL) = (void_reason IS NULL) AND (voided_at IS NULL) = (voided_by IS NULL))
);
CREATE INDEX IF NOT EXISTS assessment_measurement_series ON assessment_measurement (episode_id, body_region, side, movement, unit, measured_on);

-- A measurement can only be struck out as entered in error (once); its value never changes.
CREATE OR REPLACE FUNCTION guard_measurement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Measurements cannot be deleted; mark them entered in error' USING ERRCODE = 'P0001'; END IF;
  IF OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL
     OR (to_jsonb(NEW) - 'voided_at' - 'voided_by' - 'void_reason') <> (to_jsonb(OLD) - 'voided_at' - 'voided_by' - 'void_reason') THEN
    RAISE EXCEPTION 'Only marking a measurement as entered in error is allowed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assessment_measurement_guard BEFORE UPDATE OR DELETE ON assessment_measurement
  FOR EACH ROW EXECUTE FUNCTION guard_measurement();
