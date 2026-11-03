-- 001_core.sql — core schema for the Physio Central clinic app.
-- Invariants that matter (double booking, double billing, issued-document
-- immutability, unique numbering, append-only ledgers) are enforced HERE,
-- not only in application code. See spec §6.3, §9, §10, §18.

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────────── Organization / branches ─────────────────────────
CREATE TABLE organization (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_name      text NOT NULL,
  legal_name      text,
  identity_verified boolean NOT NULL DEFAULT false, -- false until clinic approves real identity
  gstin           text,
  gst_registered  boolean NOT NULL DEFAULT false,
  default_currency char(3) NOT NULL DEFAULT 'INR' CHECK (default_currency = 'INR'),
  timezone        text NOT NULL DEFAULT 'Asia/Kolkata',
  phone_e164      text,
  email           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branch (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  slug            text NOT NULL,
  name            text NOT NULL,
  timezone        text NOT NULL DEFAULT 'Asia/Kolkata',
  address_line    text,
  locality        text,
  city            text,
  region          text,
  postal_code     text,
  phone_e164      text,
  map_url         text,
  access_notes    text,
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  public          boolean NOT NULL DEFAULT false,
  address_verified boolean NOT NULL DEFAULT false,
  booking_lead_minutes  int NOT NULL DEFAULT 120 CHECK (booking_lead_minutes >= 0),
  booking_horizon_days  int NOT NULL DEFAULT 30 CHECK (booking_horizon_days BETWEEN 1 AND 365),
  slot_step_minutes     int NOT NULL DEFAULT 15 CHECK (slot_step_minutes IN (5,10,15,20,30,60)),
  response_window_text  text NOT NULL DEFAULT 'within one working day',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug),
  UNIQUE (id, organization_id)
);

-- ───────────────────────── Staff identity & permissions ─────────────────────
-- Auth tables (user/session/account/verification/twoFactor) are created by
-- Better Auth's migrator. staff_member links an auth user to the business.
CREATE TABLE staff_member (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  auth_user_id    text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);

CREATE TABLE role_grant (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_member_id uuid NOT NULL,
  role            text NOT NULL CHECK (role IN ('OWNER','CLINIC_ADMIN','RECEPTIONIST','PHYSIOTHERAPIST','BILLING','ACCOUNTANT','CONTENT_EDITOR')),
  branch_id       uuid,                -- NULL = all branches
  granted_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (staff_member_id, organization_id) REFERENCES staff_member(id, organization_id),
  FOREIGN KEY (branch_id, organization_id) REFERENCES branch(id, organization_id)
);
CREATE UNIQUE INDEX role_grant_unique ON role_grant (staff_member_id, role, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ───────────────────────── Resources & availability ─────────────────────────
-- One global resource identity per therapist / room / equipment unit (§6.3).
CREATE TABLE resource (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  kind            text NOT NULL CHECK (kind IN ('THERAPIST','ROOM','EQUIPMENT')),
  label           text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);

CREATE TABLE therapist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  resource_id     uuid NOT NULL UNIQUE,
  staff_member_id uuid,
  slug            text NOT NULL,
  display_name    text NOT NULL,
  designation     text NOT NULL,         -- e.g. "Physiotherapist" — never auto-prefixed "Dr"
  bio             text,
  languages       text[] NOT NULL DEFAULT '{}',
  public          boolean NOT NULL DEFAULT false,
  credentials_verified boolean NOT NULL DEFAULT false, -- internal verification record flag
  image_consent   boolean NOT NULL DEFAULT false,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug),
  UNIQUE (id, organization_id),
  FOREIGN KEY (resource_id, organization_id) REFERENCES resource(id, organization_id),
  FOREIGN KEY (staff_member_id, organization_id) REFERENCES staff_member(id, organization_id)
);

CREATE TABLE therapist_branch (
  therapist_id uuid NOT NULL REFERENCES therapist(id),
  branch_id    uuid NOT NULL REFERENCES branch(id),
  PRIMARY KEY (therapist_id, branch_id)
);

-- Recurring weekly working hours, in the branch's local time (§6.3).
CREATE TABLE availability_rule (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id  uuid NOT NULL REFERENCES resource(id),
  branch_id    uuid NOT NULL REFERENCES branch(id),
  weekday      smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Sunday (Postgres DOW)
  start_local  time NOT NULL,
  end_local    time NOT NULL,
  CHECK (end_local > start_local)
);
CREATE INDEX availability_rule_resource ON availability_rule (resource_id, weekday);

-- Dated exceptions: leave, closures, breaks. Absolute instants.
CREATE TABLE availability_exception (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id  uuid REFERENCES resource(id),
  branch_id    uuid REFERENCES branch(id),
  blocked      tstzrange NOT NULL CHECK (NOT isempty(blocked) AND lower_inc(blocked) AND NOT upper_inc(blocked)),
  reason       text NOT NULL,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (resource_id IS NOT NULL OR branch_id IS NOT NULL)
);
CREATE INDEX availability_exception_gist ON availability_exception USING gist (resource_id, blocked);

-- ───────────────────────── Catalog & pricing ─────────────────────────
CREATE TABLE service_category (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  name            text NOT NULL,
  slug            text NOT NULL,
  sort_order      int NOT NULL DEFAULT 0,
  UNIQUE (organization_id, slug)
);

CREATE TABLE tax_category (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  code            text NOT NULL,
  name            text NOT NULL,
  rate_bp         int  NOT NULL CHECK (rate_bp BETWEEN 0 AND 10000), -- basis points: 1800 = 18%
  price_inclusive boolean NOT NULL DEFAULT false,
  exemption_basis text,
  hsn_sac         text,
  accountant_approved boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE service (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  category_id     uuid REFERENCES service_category(id),
  code            text NOT NULL,
  slug            text NOT NULL,
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  public          boolean NOT NULL DEFAULT false,
  bookable        boolean NOT NULL DEFAULT false,
  billing_unit    text NOT NULL DEFAULT 'Session',
  duration_minutes int NOT NULL DEFAULT 45 CHECK (duration_minutes BETWEEN 5 AND 480),
  buffer_before_minutes int NOT NULL DEFAULT 0 CHECK (buffer_before_minutes BETWEEN 0 AND 120),
  buffer_after_minutes  int NOT NULL DEFAULT 0 CHECK (buffer_after_minutes BETWEEN 0 AND 120),
  summary         text,
  body            text,
  who_it_may_help text,
  what_to_expect  text,
  limitations     text,
  bill_description text,
  internal_guidance text,
  fee_policy_text text,                  -- shown when no published fee
  requires_extra_approval boolean NOT NULL DEFAULT true,
  clinical_reviewer text,
  reviewed_on     date,
  version         int NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code),
  UNIQUE (organization_id, slug),
  UNIQUE (id, organization_id),
  -- A publicly listed ACTIVE service must have been clinically reviewed.
  CHECK (NOT (public AND status = 'ACTIVE') OR (clinical_reviewer IS NOT NULL AND reviewed_on IS NOT NULL))
);

CREATE TABLE service_branch (
  service_id uuid NOT NULL REFERENCES service(id),
  branch_id  uuid NOT NULL REFERENCES branch(id),
  PRIMARY KEY (service_id, branch_id)
);

CREATE TABLE therapist_skill (
  therapist_id uuid NOT NULL REFERENCES therapist(id),
  service_id   uuid NOT NULL REFERENCES service(id),
  PRIMARY KEY (therapist_id, service_id)
);

-- Effective-dated price versions; no overlap per service/branch context (§7.1).
CREATE TABLE service_price_version (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id      uuid NOT NULL REFERENCES service(id),
  branch_id       uuid REFERENCES branch(id),
  valid_during    tstzrange NOT NULL CHECK (NOT isempty(valid_during) AND NOT lower_inf(valid_during) AND lower_inc(valid_during) AND NOT upper_inc(valid_during)),
  unit_price_paise bigint NOT NULL CHECK (unit_price_paise >= 0),
  currency        char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  tax_category_id uuid REFERENCES tax_category(id),
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  EXCLUDE USING gist (
    service_id WITH =,
    (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    valid_during WITH &&
  )
);

-- ───────────────────────── Patients & consent ─────────────────────────
CREATE TABLE patient (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  public_ref      text NOT NULL UNIQUE,
  full_name       text NOT NULL,
  is_new_patient  boolean,
  identity_verified boolean NOT NULL DEFAULT false,
  archived        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);

-- Phone is NOT a unique patient key (§12.3) — intentionally no unique index.
CREATE TABLE patient_contact (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES patient(id),
  kind         text NOT NULL CHECK (kind IN ('PHONE','EMAIL')),
  value        text NOT NULL,
  verified_at  timestamptz,
  preferred    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX patient_contact_value ON patient_contact (kind, value);

CREATE TABLE consent_record (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  patient_id      uuid NOT NULL REFERENCES patient(id),
  purpose         text NOT NULL CHECK (purpose IN ('BOOKING_PRIVACY_ACK','TRANSACTIONAL_COMMS','MARKETING','TREATMENT','TESTIMONIAL_MEDIA')),
  granted         boolean NOT NULL,
  notice_version  text NOT NULL,
  method          text NOT NULL,       -- WEB_FORM, STAFF_PHONE, STAFF_IN_PERSON
  actor           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  withdrawn_at    timestamptz
);

-- ───────────────────────── Idempotency ─────────────────────────
CREATE TABLE idempotency_record (
  scope        text NOT NULL,          -- actor/session + action
  key          text NOT NULL,
  request_hash text NOT NULL,
  response     jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

-- ───────────────────────── Appointments ─────────────────────────
CREATE TABLE appointment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  public_ref      text NOT NULL UNIQUE,
  patient_id      uuid NOT NULL,
  service_id      uuid NOT NULL,
  branch_id       uuid NOT NULL,
  mode            text NOT NULL DEFAULT 'CLINIC' CHECK (mode IN ('CLINIC','HOME_VISIT')),
  requested_therapist_id uuid REFERENCES therapist(id),   -- NULL = "Any available"
  therapist_id    uuid REFERENCES therapist(id),           -- assigned on acceptance
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  duration_minutes int NOT NULL,       -- snapshot (§6.3)
  buffer_before_minutes int NOT NULL DEFAULT 0,
  buffer_after_minutes  int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
                    'REQUESTED','AWAITING_PATIENT_CONFIRMATION','AWAITING_DEPOSIT','CONFIRMED',
                    'CHECKED_IN','IN_PROGRESS','COMPLETED','REJECTED','CANCELLED','NO_SHOW')),
  source          text NOT NULL CHECK (source IN ('WEB','PHONE','WALK_IN','STAFF')),
  contact_verified boolean NOT NULL DEFAULT false,
  reason_brief    text CHECK (char_length(reason_brief) <= 500),
  accessibility_needs text CHECK (char_length(accessibility_needs) <= 500),
  quoted_price_paise bigint CHECK (quoted_price_paise >= 0),
  policy_version  text NOT NULL,
  patient_message text,                -- patient-facing rejection/cancel message
  internal_note   text,                -- staff-only
  created_by      text NOT NULL,
  version         int NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (id, organization_id),
  FOREIGN KEY (patient_id, organization_id) REFERENCES patient(id, organization_id),
  FOREIGN KEY (service_id, organization_id) REFERENCES service(id, organization_id),
  FOREIGN KEY (branch_id, organization_id) REFERENCES branch(id, organization_id)
);
CREATE INDEX appointment_status_start ON appointment (organization_id, status, starts_at);
CREATE INDEX appointment_patient ON appointment (patient_id);

CREATE TABLE appointment_status_event (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointment(id),
  from_status    text,
  to_status      text NOT NULL,
  actor          text NOT NULL,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointment_status_event_appt ON appointment_status_event (appointment_id, created_at);

-- §6.3 / §25.2: overlap guard on active reservations, half-open [start,end).
CREATE TABLE resource_reservation (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id    uuid NOT NULL REFERENCES resource(id),
  appointment_id uuid NOT NULL REFERENCES appointment(id),
  occupied_at    tstzrange NOT NULL,
  state          text NOT NULL CHECK (state IN ('HELD','CONFIRMED','RELEASED','EXPIRED')),
  expires_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT isempty(occupied_at) AND NOT lower_inf(occupied_at) AND NOT upper_inf(occupied_at)
         AND lower_inc(occupied_at) AND NOT upper_inc(occupied_at)),
  CHECK (state <> 'HELD' OR expires_at IS NOT NULL),
  EXCLUDE USING gist (resource_id WITH =, occupied_at WITH &&) WHERE (state IN ('HELD','CONFIRMED'))
);
CREATE INDEX resource_reservation_appt ON resource_reservation (appointment_id);

-- Secure patient management links: only hashes stored (AUTH-06).
CREATE TABLE manage_token (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointment(id),
  token_hash     text NOT NULL UNIQUE,
  purpose        text NOT NULL DEFAULT 'MANAGE_APPOINTMENT',
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  last_used_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── Estimates ─────────────────────────
CREATE TABLE estimate (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  patient_id      uuid NOT NULL REFERENCES patient(id),
  appointment_id  uuid REFERENCES appointment(id),
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE estimate_version (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id     uuid NOT NULL REFERENCES estimate(id),
  version_no      int NOT NULL,
  status          text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','ACCEPTED','DECLINED','EXPIRED','SUPERSEDED')),
  valid_until     timestamptz,
  subtotal_paise  bigint NOT NULL DEFAULT 0,
  tax_paise       bigint NOT NULL DEFAULT 0,
  total_paise     bigint NOT NULL DEFAULT 0,
  content_hash    text,                -- frozen at send
  terms           text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estimate_id, version_no)
);

CREATE TABLE estimate_line (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_version_id uuid NOT NULL REFERENCES estimate_version(id),
  service_id      uuid REFERENCES service(id),
  description     text NOT NULL,
  quantity        numeric(10,3) NOT NULL CHECK (quantity > 0),
  unit_price_paise bigint NOT NULL CHECK (unit_price_paise >= 0),
  discount_paise  bigint NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  tax_rate_bp     int NOT NULL DEFAULT 0 CHECK (tax_rate_bp BETWEEN 0 AND 10000),
  tax_inclusive   boolean NOT NULL DEFAULT false,
  taxable_paise   bigint NOT NULL,
  tax_paise       bigint NOT NULL,
  total_paise     bigint NOT NULL,
  is_extra        boolean NOT NULL DEFAULT false,
  reason          text,
  sort_order      int NOT NULL DEFAULT 0
);

CREATE TABLE estimate_approval (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_version_id uuid NOT NULL UNIQUE REFERENCES estimate_version(id),
  decision        text NOT NULL CHECK (decision IN ('ACCEPTED','DECLINED')),
  method          text NOT NULL CHECK (method IN ('SECURE_LINK','STAFF_RECORDED_IN_PERSON','STAFF_RECORDED_PHONE')),
  content_hash    text NOT NULL,
  actor           text NOT NULL,
  attestation     text,
  notice_version  text NOT NULL,
  decided_at      timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── Billing ─────────────────────────
-- A performed / approved billable event. Billed at most once (§9.1).
CREATE TABLE billable_charge (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  patient_id      uuid NOT NULL REFERENCES patient(id),
  appointment_id  uuid REFERENCES appointment(id),
  service_id      uuid REFERENCES service(id),
  estimate_line_id uuid REFERENCES estimate_line(id),
  description     text NOT NULL,
  billing_unit    text NOT NULL DEFAULT 'Session',
  quantity        numeric(10,3) NOT NULL CHECK (quantity > 0),
  unit_price_paise bigint NOT NULL CHECK (unit_price_paise >= 0),
  discount_paise  bigint NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  tax_rate_bp     int NOT NULL DEFAULT 0,
  tax_inclusive   boolean NOT NULL DEFAULT false,
  performed_verified_by text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX billable_charge_from_estimate_line ON billable_charge (estimate_line_id) WHERE estimate_line_id IS NOT NULL;

CREATE TABLE document_sequence (
  organization_id uuid NOT NULL REFERENCES organization(id),
  series          text NOT NULL,       -- 'INV', 'RCT', 'CN'
  financial_year  text NOT NULL,       -- '2026-27'
  next_value      int  NOT NULL DEFAULT 1 CHECK (next_value > 0),
  PRIMARY KEY (organization_id, series, financial_year)
);

CREATE TABLE invoice (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  patient_id      uuid NOT NULL REFERENCES patient(id),
  appointment_id  uuid REFERENCES appointment(id),
  estimate_version_id uuid REFERENCES estimate_version(id),
  status          text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','VOIDED')),
  document_type   text NOT NULL DEFAULT 'BILL' CHECK (document_type IN ('BILL','BILL_OF_SUPPLY','TAX_INVOICE')),
  series          text NOT NULL DEFAULT 'INV',
  financial_year  text,
  number          text,
  issued_at       timestamptz,
  issued_by       text,
  subtotal_paise  bigint NOT NULL DEFAULT 0,
  tax_paise       bigint NOT NULL DEFAULT 0,
  total_paise     bigint NOT NULL DEFAULT 0,
  snapshot        jsonb,
  renderer_version text,
  version         int NOT NULL DEFAULT 1,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'DRAFT') = (number IS NULL)),
  CHECK (status = 'DRAFT' OR (issued_at IS NOT NULL AND snapshot IS NOT NULL AND financial_year IS NOT NULL))
);
CREATE UNIQUE INDEX invoice_number_unique ON invoice (organization_id, series, financial_year, number) WHERE number IS NOT NULL;

CREATE TABLE invoice_line (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES invoice(id),
  billable_charge_id uuid NOT NULL REFERENCES billable_charge(id),
  description     text NOT NULL,
  billing_unit    text NOT NULL,
  quantity        numeric(10,3) NOT NULL CHECK (quantity > 0),
  unit_price_paise bigint NOT NULL CHECK (unit_price_paise >= 0),
  discount_paise  bigint NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  tax_rate_bp     int NOT NULL,
  tax_inclusive   boolean NOT NULL,
  taxable_paise   bigint NOT NULL,
  tax_paise       bigint NOT NULL,
  total_paise     bigint NOT NULL,
  sort_order      int NOT NULL DEFAULT 0
);
-- UAT-34: one invoice line per performed charge, across competing drafts.
CREATE UNIQUE INDEX invoice_line_charge_claim ON invoice_line (billable_charge_id);

-- ───────────────────────── Payments ledger ─────────────────────────
CREATE TABLE payment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  patient_id      uuid NOT NULL REFERENCES patient(id),
  method          text NOT NULL CHECK (method IN ('CASH','UPI_MANUAL','BANK_TRANSFER','GATEWAY')),
  amount_paise    bigint NOT NULL CHECK (amount_paise > 0),
  currency        char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','FAILED','CANCELLED','REVERSED')),
  reference       text,
  received_on     date NOT NULL,
  receiving_account text NOT NULL,     -- cash drawer / bank account label
  note            text,
  recorded_by     text NOT NULL,
  verified_by     text,
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'VERIFIED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)),
  CHECK (method = 'CASH' OR reference IS NOT NULL)
);
CREATE UNIQUE INDEX payment_reference_unique ON payment (organization_id, method, reference) WHERE reference IS NOT NULL AND status NOT IN ('FAILED','CANCELLED');

-- Append-only allocation ledger: ALLOCATE credits an invoice, RELEASE debits it.
CREATE TABLE payment_allocation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      uuid NOT NULL REFERENCES payment(id),
  invoice_id      uuid NOT NULL REFERENCES invoice(id),
  kind            text NOT NULL CHECK (kind IN ('ALLOCATE','RELEASE')),
  amount_paise    bigint NOT NULL CHECK (amount_paise > 0),
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_allocation_invoice ON payment_allocation (invoice_id);
CREATE INDEX payment_allocation_payment ON payment_allocation (payment_id);

CREATE TABLE receipt (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  payment_id      uuid NOT NULL UNIQUE REFERENCES payment(id),
  financial_year  text NOT NULL,
  number          text NOT NULL,
  snapshot        jsonb NOT NULL,
  issued_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, financial_year, number)
);

-- ───────────────────────── Outbox / audit ─────────────────────────
CREATE TABLE outbox_event (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic        text NOT NULL,
  dedupe_key   text NOT NULL UNIQUE,
  payload      jsonb NOT NULL,          -- safe references only, no clinical data
  status       text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','LEASED','DONE','DEAD')),
  attempts     int NOT NULL DEFAULT 0,
  next_run_at  timestamptz NOT NULL DEFAULT now(),
  lease_until  timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending ON outbox_event (status, next_run_at);

CREATE TABLE audit_event (
  id              bigserial PRIMARY KEY,
  organization_id uuid,
  actor           text NOT NULL,
  action          text NOT NULL,
  target_type     text NOT NULL,
  target_id       text,
  changes         jsonb,
  reason          text,
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_event_target ON audit_event (target_type, target_id);

-- ───────────────────────── Immutability triggers ─────────────────────────
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not permitted (append-only)', TG_OP, TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER audit_event_append_only BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER payment_allocation_append_only BEFORE UPDATE OR DELETE ON payment_allocation
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER receipt_append_only BEFORE UPDATE OR DELETE ON receipt
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER status_event_append_only BEFORE UPDATE OR DELETE ON appointment_status_event
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER estimate_approval_append_only BEFORE UPDATE OR DELETE ON estimate_approval
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Issued invoices: financial fields and lines are frozen (§9.4, UAT-21).
CREATE OR REPLACE FUNCTION guard_issued_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'issued invoice % cannot be deleted', OLD.id USING ERRCODE = 'P0002';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' THEN
    IF NEW.number IS DISTINCT FROM OLD.number OR NEW.total_paise <> OLD.total_paise
       OR NEW.subtotal_paise <> OLD.subtotal_paise OR NEW.tax_paise <> OLD.tax_paise
       OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.patient_id <> OLD.patient_id
       OR NEW.issued_at IS DISTINCT FROM OLD.issued_at OR NEW.financial_year IS DISTINCT FROM OLD.financial_year
       OR (NEW.status = 'DRAFT') THEN
      RAISE EXCEPTION 'issued invoice % is immutable; use a credit note', OLD.id USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_guard BEFORE UPDATE OR DELETE ON invoice
  FOR EACH ROW EXECUTE FUNCTION guard_issued_invoice();

CREATE OR REPLACE FUNCTION guard_issued_invoice_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM invoice WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF s IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'lines of an issued invoice are immutable' USING ERRCODE = 'P0002';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER invoice_line_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_line
  FOR EACH ROW EXECUTE FUNCTION guard_issued_invoice_line();

-- Verified payments: amount/method/payer never rewritten; only VERIFIED -> REVERSED.
CREATE OR REPLACE FUNCTION guard_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments are never deleted' USING ERRCODE = 'P0003';
  END IF;
  IF NEW.amount_paise <> OLD.amount_paise OR NEW.method <> OLD.method OR NEW.patient_id <> OLD.patient_id
     OR NEW.currency <> OLD.currency THEN
    RAISE EXCEPTION 'payment financial fields are immutable' USING ERRCODE = 'P0003';
  END IF;
  IF OLD.status = 'VERIFIED' AND NEW.status NOT IN ('VERIFIED','REVERSED') THEN
    RAISE EXCEPTION 'verified payment can only be reversed' USING ERRCODE = 'P0003';
  END IF;
  IF OLD.status IN ('FAILED','CANCELLED','REVERSED') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'terminal payment state' USING ERRCODE = 'P0003';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_guard BEFORE UPDATE OR DELETE ON payment
  FOR EACH ROW EXECUTE FUNCTION guard_payment();

-- Derived balances from posted events (§10.2). Credit notes/refunds are not in
-- this release, so their terms are zero; the view is the single balance source.
CREATE VIEW invoice_balance AS
SELECT i.id AS invoice_id,
       i.organization_id,
       i.patient_id,
       i.total_paise AS net_liability_paise,
       COALESCE(SUM(CASE WHEN a.kind = 'ALLOCATE' THEN a.amount_paise ELSE -a.amount_paise END), 0)::bigint AS net_allocated_paise,
       GREATEST(0, i.total_paise - COALESCE(SUM(CASE WHEN a.kind = 'ALLOCATE' THEN a.amount_paise ELSE -a.amount_paise END), 0))::bigint AS amount_due_paise,
       GREATEST(0, COALESCE(SUM(CASE WHEN a.kind = 'ALLOCATE' THEN a.amount_paise ELSE -a.amount_paise END), 0) - i.total_paise)::bigint AS excess_paise
FROM invoice i
LEFT JOIN payment_allocation a ON a.invoice_id = i.id
WHERE i.status = 'ISSUED'
GROUP BY i.id;

CREATE VIEW payment_funds AS
SELECT p.id AS payment_id,
       p.amount_paise,
       COALESCE(SUM(CASE WHEN a.kind = 'ALLOCATE' THEN a.amount_paise ELSE -a.amount_paise END), 0)::bigint AS allocated_paise,
       (p.amount_paise - COALESCE(SUM(CASE WHEN a.kind = 'ALLOCATE' THEN a.amount_paise ELSE -a.amount_paise END), 0))::bigint AS unallocated_paise
FROM payment p
LEFT JOIN payment_allocation a ON a.payment_id = p.id
GROUP BY p.id;

-- Estimate lines freeze once their version leaves DRAFT (§8.1).
CREATE OR REPLACE FUNCTION guard_estimate_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM estimate_version WHERE id = COALESCE(NEW.estimate_version_id, OLD.estimate_version_id);
  IF s IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'estimate version is frozen; create a new version' USING ERRCODE = 'P0004';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER estimate_line_guard BEFORE INSERT OR UPDATE OR DELETE ON estimate_line
  FOR EACH ROW EXECUTE FUNCTION guard_estimate_line();

CREATE OR REPLACE FUNCTION guard_estimate_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (NEW.total_paise <> OLD.total_paise OR NEW.subtotal_paise <> OLD.subtotal_paise
      OR NEW.tax_paise <> OLD.tax_paise OR NEW.content_hash IS DISTINCT FROM OLD.content_hash) THEN
    RAISE EXCEPTION 'sent estimate versions are immutable' USING ERRCODE = 'P0004';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER estimate_version_guard BEFORE UPDATE ON estimate_version
  FOR EACH ROW EXECUTE FUNCTION guard_estimate_version();

-- Fixed-window rate limiting shared across instances (SEC-09).
CREATE TABLE rate_limit_bucket (
  bucket_key   text NOT NULL,
  window_start timestamptz NOT NULL,
  hits         int NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);
