-- 008_clinic_ops.sql
-- 1) expense: clinic spending, so reports can show profit (net collected − expenses).
--    Entries are never deleted; a wrong entry is voided with a reason.
-- 2) patient_document (+ patient_document_content): scans and reports uploaded
--    for a patient (X-ray, MRI, lab reports…). Bytes live in a separate table so
--    lists never load file contents. Soft delete only (clinical record retention).
-- 3) patient_package.valid_until: package expiry. NULL = no expiry (packages sold
--    before this change). Sessions are now used up at check-in, not at booking
--    (no schema change: derived from appointment status).
-- 4) exercise / home_programme / home_programme_item: exercise library and the
--    printed home exercise sheet. Items snapshot the exercise text, so editing the
--    library never changes a sheet already given to a patient.
-- 5) payment_reminder: log of balance reminders emailed to patients.

-- ───────────────────────── 1. Expenses ─────────────────────────
CREATE TABLE IF NOT EXISTS expense (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  spent_on        date NOT NULL,
  category        text NOT NULL CHECK (category IN ('RENT','SALARIES','UTILITIES','CONSUMABLES','EQUIPMENT','MAINTENANCE','MARKETING','SOFTWARE','PROFESSIONAL_FEES','TAXES_FEES','OTHER')),
  amount_paise    bigint NOT NULL CHECK (amount_paise > 0 AND amount_paise <= 100000000000),
  paid_via        text NOT NULL CHECK (paid_via IN ('CASH','UPI','BANK_TRANSFER','CARD','CHEQUE','OTHER')),
  payee           text CHECK (char_length(payee) <= 120),
  note            text CHECK (char_length(note) <= 500),
  status          text NOT NULL DEFAULT 'RECORDED' CHECK (status IN ('RECORDED','VOIDED')),
  recorded_by     text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  voided_by       text,
  voided_at       timestamptz,
  void_reason     text CHECK (char_length(void_reason) <= 500),
  CHECK ((status = 'VOIDED') = (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS expense_org_day ON expense (organization_id, spent_on DESC) WHERE status = 'RECORDED';

-- ───────────────────────── 2. Patient documents ─────────────────────────
CREATE TABLE IF NOT EXISTS patient_document (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  patient_id      uuid NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('XRAY','MRI','CT','ULTRASOUND','LAB','PRESCRIPTION','DISCHARGE','REFERRAL','OTHER')),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  document_date   date,
  file_name       text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  mime_type       text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes      int  NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 4194304),
  sha256          text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by     text NOT NULL,
  uploaded_by_name text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  deleted_by      text,
  delete_reason   text CHECK (char_length(delete_reason) <= 500),
  FOREIGN KEY (patient_id, organization_id) REFERENCES patient(id, organization_id),
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL AND delete_reason IS NULL))
);
CREATE INDEX IF NOT EXISTS patient_document_patient ON patient_document (patient_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS patient_document_content (
  document_id     uuid PRIMARY KEY REFERENCES patient_document(id),
  content         bytea NOT NULL
);
-- Stored file bytes never change once written.
CREATE TRIGGER patient_document_content_immutable BEFORE UPDATE OR DELETE ON patient_document_content
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ───────────────────────── 3. Package expiry ─────────────────────────
ALTER TABLE patient_package ADD COLUMN IF NOT EXISTS valid_until date;

-- ───────────────────────── 4. Home exercise programmes ─────────────────────────
CREATE TABLE IF NOT EXISTS exercise (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  body_region     text CHECK (char_length(body_region) <= 60),
  instructions    text NOT NULL CHECK (char_length(instructions) BETWEEN 2 AND 1500),
  default_sets    int  CHECK (default_sets BETWEEN 1 AND 20),
  default_reps    int  CHECK (default_reps BETWEEN 1 AND 200),
  default_hold_seconds int CHECK (default_hold_seconds BETWEEN 1 AND 600),
  active          boolean NOT NULL DEFAULT true,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS exercise_org_name ON exercise (organization_id, lower(name));

CREATE TABLE IF NOT EXISTS home_programme (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  patient_id      uuid NOT NULL,
  episode_id      uuid REFERENCES care_episode(id),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  advice          text CHECK (char_length(advice) <= 1500),
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','STOPPED')),
  therapist_id    uuid NOT NULL REFERENCES therapist(id),
  author_name     text NOT NULL,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  stopped_at      timestamptz,
  stopped_by      text,
  FOREIGN KEY (patient_id, organization_id) REFERENCES patient(id, organization_id),
  CHECK ((status = 'STOPPED') = (stopped_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS home_programme_patient ON home_programme (patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS home_programme_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id    uuid NOT NULL REFERENCES home_programme(id),
  position        int  NOT NULL CHECK (position BETWEEN 1 AND 30),
  exercise_id     uuid REFERENCES exercise(id),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  instructions    text NOT NULL CHECK (char_length(instructions) BETWEEN 2 AND 1500),
  sets            int  CHECK (sets BETWEEN 1 AND 20),
  reps            int  CHECK (reps BETWEEN 1 AND 200),
  hold_seconds    int  CHECK (hold_seconds BETWEEN 1 AND 600),
  times_per_day   int  CHECK (times_per_day BETWEEN 1 AND 12),
  days_per_week   int  CHECK (days_per_week BETWEEN 1 AND 7),
  note            text CHECK (char_length(note) <= 300),
  UNIQUE (programme_id, position)
);
-- A sheet handed to a patient is never edited; the physio issues a new one.
CREATE TRIGGER home_programme_item_immutable BEFORE UPDATE OR DELETE ON home_programme_item
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ───────────────────────── 5. Payment reminders ─────────────────────────
CREATE TABLE IF NOT EXISTS payment_reminder (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  patient_id      uuid NOT NULL,
  channel         text NOT NULL DEFAULT 'EMAIL' CHECK (channel IN ('EMAIL')),
  sent_to         text NOT NULL,
  amount_due_paise bigint NOT NULL CHECK (amount_due_paise > 0),
  invoice_ids     uuid[] NOT NULL,
  status          text NOT NULL CHECK (status IN ('SENT','FAILED')),
  error           text CHECK (char_length(error) <= 300),
  sent_by         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (patient_id, organization_id) REFERENCES patient(id, organization_id)
);
CREATE INDEX IF NOT EXISTS payment_reminder_patient ON payment_reminder (patient_id, created_at DESC);
CREATE TRIGGER payment_reminder_append_only BEFORE UPDATE OR DELETE ON payment_reminder
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
