-- 004_patient_profile_packages.sql
-- 1) Registration details asked for by the clinic: age, sex, address,
--    diagnosis and treatment protocol. Age is stored with the date it was
--    recorded so the admin can show the current age without asking for a DOB.
-- 2) Treatment packages (7-, 10-, 30-day …): one patient_package row groups the
--    appointments booked under it, so staff can see sessions done / booked / left.

ALTER TABLE patient
  ADD COLUMN IF NOT EXISTS age_years          int  CHECK (age_years BETWEEN 0 AND 120),
  ADD COLUMN IF NOT EXISTS age_recorded_on    date,
  ADD COLUMN IF NOT EXISTS sex                text CHECK (sex IN ('MALE','FEMALE','OTHER')),
  ADD COLUMN IF NOT EXISTS address            text CHECK (char_length(address) <= 500),
  ADD COLUMN IF NOT EXISTS diagnosis          text CHECK (char_length(diagnosis) <= 2000),
  ADD COLUMN IF NOT EXISTS treatment_protocol text CHECK (char_length(treatment_protocol) <= 4000);

CREATE TABLE IF NOT EXISTS patient_package (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  patient_id      uuid NOT NULL,
  public_ref      text NOT NULL UNIQUE,
  name            text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  sessions_total  int  NOT NULL CHECK (sessions_total BETWEEN 1 AND 60),
  price_paise     bigint CHECK (price_paise >= 0),
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED')),
  note            text CHECK (char_length(note) <= 500),
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (patient_id, organization_id) REFERENCES patient(id, organization_id)
);
CREATE INDEX IF NOT EXISTS patient_package_org_status ON patient_package (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS patient_package_patient ON patient_package (patient_id);

ALTER TABLE appointment ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES patient_package(id);
CREATE INDEX IF NOT EXISTS appointment_package ON appointment (package_id) WHERE package_id IS NOT NULL;
