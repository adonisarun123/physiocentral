-- 005_op_number_refunds.sql
-- 1) OP number: a simple running out-patient number per clinic (shown as OP-0001).
--    The random public_ref stays as the internal reference; documents already
--    issued keep whatever they printed.
-- 2) Refunds: money paid back to a patient, in full or in part, with the staff
--    member who approved it. A refund never edits the original payment.
-- 3) Reversals: a verified payment that was entered by mistake (VERIFIED -> REVERSED).
-- 4) Credit notes: reduce what an issued bill asks for, so a refunded bill does
--    not keep showing an amount due.

-- ───────────────────────── OP number ─────────────────────────
ALTER TABLE patient ADD COLUMN IF NOT EXISTS op_number int CHECK (op_number > 0);
CREATE UNIQUE INDEX IF NOT EXISTS patient_op_number_unique ON patient (organization_id, op_number) WHERE op_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS patient_op_sequence (
  organization_id uuid PRIMARY KEY REFERENCES organization(id),
  next_value      int NOT NULL DEFAULT 1 CHECK (next_value > 0)
);

-- Existing patients are numbered in registration order. Archived records
-- (test entries, merged duplicates) never take a number.
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY organization_id ORDER BY created_at, id) AS n
    FROM patient WHERE NOT archived AND op_number IS NULL
)
UPDATE patient p SET op_number = numbered.n FROM numbered WHERE numbered.id = p.id;

INSERT INTO patient_op_sequence (organization_id, next_value)
SELECT organization_id, max(op_number) + 1 FROM patient WHERE op_number IS NOT NULL GROUP BY organization_id
ON CONFLICT (organization_id) DO UPDATE SET next_value = EXCLUDED.next_value;

-- Gives the patient the next OP number once; later calls return the same number.
CREATE OR REPLACE FUNCTION assign_op_number(pid uuid) RETURNS int LANGUAGE plpgsql AS $$
DECLARE org uuid; cur int; arch boolean; n int;
BEGIN
  SELECT op_number INTO cur FROM patient WHERE id = pid;
  IF cur IS NOT NULL THEN RETURN cur; END IF;
  SELECT organization_id, op_number, archived INTO org, cur, arch FROM patient WHERE id = pid FOR UPDATE;
  IF NOT FOUND OR arch THEN RETURN NULL; END IF;
  IF cur IS NOT NULL THEN RETURN cur; END IF;
  INSERT INTO patient_op_sequence (organization_id, next_value) VALUES (org, 2)
  ON CONFLICT (organization_id) DO UPDATE SET next_value = patient_op_sequence.next_value + 1
  RETURNING next_value - 1 INTO n;
  UPDATE patient SET op_number = n WHERE id = pid;
  RETURN n;
END $$;

-- An online request creates a patient record before anyone has checked it, so
-- it gets its OP number only when it becomes a real visit, bill or payment.
-- Rejected and spam requests never use up a number.
CREATE OR REPLACE FUNCTION op_number_on_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'appointment' AND NEW.status NOT IN ('CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','NO_SHOW') THEN
    RETURN NEW;
  END IF;
  PERFORM assign_op_number(NEW.patient_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS appointment_op_number ON appointment;
CREATE TRIGGER appointment_op_number AFTER INSERT OR UPDATE OF status ON appointment
  FOR EACH ROW EXECUTE FUNCTION op_number_on_activity();
DROP TRIGGER IF EXISTS payment_op_number ON payment;
CREATE TRIGGER payment_op_number AFTER INSERT ON payment
  FOR EACH ROW EXECUTE FUNCTION op_number_on_activity();
DROP TRIGGER IF EXISTS invoice_op_number ON invoice;
CREATE TRIGGER invoice_op_number AFTER INSERT ON invoice
  FOR EACH ROW EXECUTE FUNCTION op_number_on_activity();
DROP TRIGGER IF EXISTS patient_package_op_number ON patient_package;
CREATE TRIGGER patient_package_op_number AFTER INSERT ON patient_package
  FOR EACH ROW EXECUTE FUNCTION op_number_on_activity();

-- ───────────────────────── Reversals ─────────────────────────
ALTER TABLE payment
  ADD COLUMN IF NOT EXISTS reversed_by     text,
  ADD COLUMN IF NOT EXISTS reversed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reason text CHECK (char_length(reversal_reason) <= 300);
ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_reversal_recorded;
ALTER TABLE payment ADD CONSTRAINT payment_reversal_recorded
  CHECK (status <> 'REVERSED' OR (reversed_by IS NOT NULL AND reversed_at IS NOT NULL AND reversal_reason IS NOT NULL));

-- ───────────────────────── Refunds ─────────────────────────
CREATE TABLE IF NOT EXISTS payment_refund (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organization(id),
  payment_id       uuid NOT NULL REFERENCES payment(id),
  patient_id       uuid NOT NULL REFERENCES patient(id),
  appointment_id   uuid REFERENCES appointment(id),   -- the cancelled visit, when the refund came from one
  amount_paise     bigint NOT NULL CHECK (amount_paise > 0),
  method           text NOT NULL CHECK (method IN ('CASH','UPI_MANUAL','BANK_TRANSFER')),
  reference        text,
  refunded_on      date NOT NULL,
  paid_from        text NOT NULL,                      -- cash drawer / bank account label
  reason           text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  approved_by      text NOT NULL,                      -- "staff:<id>"
  approved_by_name text NOT NULL,                      -- name as it was at the time
  financial_year   text NOT NULL,
  number           text NOT NULL,                      -- RFD/2026-27/000001
  snapshot         jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, financial_year, number),
  CHECK (method = 'CASH' OR reference IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS payment_refund_payment ON payment_refund (payment_id);
CREATE INDEX IF NOT EXISTS payment_refund_patient ON payment_refund (patient_id);
CREATE INDEX IF NOT EXISTS payment_refund_org_date ON payment_refund (organization_id, refunded_on);

DROP TRIGGER IF EXISTS payment_refund_append_only ON payment_refund;
CREATE TRIGGER payment_refund_append_only BEFORE UPDATE OR DELETE ON payment_refund
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Final guard: only verified payments are refunded, never for more than was paid.
CREATE OR REPLACE FUNCTION guard_payment_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pay payment%ROWTYPE; already bigint;
BEGIN
  SELECT * INTO pay FROM payment WHERE id = NEW.payment_id FOR UPDATE;
  IF NOT FOUND OR pay.organization_id <> NEW.organization_id OR pay.patient_id <> NEW.patient_id THEN
    RAISE EXCEPTION 'refund does not match its payment' USING ERRCODE = 'P0005';
  END IF;
  IF pay.status <> 'VERIFIED' THEN
    RAISE EXCEPTION 'only verified payments can be refunded' USING ERRCODE = 'P0005';
  END IF;
  SELECT COALESCE(sum(amount_paise), 0) INTO already FROM payment_refund WHERE payment_id = NEW.payment_id;
  IF already + NEW.amount_paise > pay.amount_paise THEN
    RAISE EXCEPTION 'refunds exceed the payment amount' USING ERRCODE = 'P0005';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payment_refund_guard ON payment_refund;
CREATE TRIGGER payment_refund_guard BEFORE INSERT ON payment_refund
  FOR EACH ROW EXECUTE FUNCTION guard_payment_refund();

-- A payment that has been refunded is real money that moved: it cannot be reversed.
CREATE OR REPLACE FUNCTION guard_payment_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'REVERSED' AND OLD.status <> 'REVERSED'
     AND EXISTS (SELECT 1 FROM payment_refund WHERE payment_id = OLD.id) THEN
    RAISE EXCEPTION 'a refunded payment cannot be reversed' USING ERRCODE = 'P0005';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payment_reversal_guard ON payment;
CREATE TRIGGER payment_reversal_guard BEFORE UPDATE ON payment
  FOR EACH ROW EXECUTE FUNCTION guard_payment_reversal();

-- ───────────────────────── Credit notes ─────────────────────────
CREATE TABLE IF NOT EXISTS credit_note (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  invoice_id      uuid NOT NULL REFERENCES invoice(id),
  patient_id      uuid NOT NULL REFERENCES patient(id),
  refund_id       uuid REFERENCES payment_refund(id),
  amount_paise    bigint NOT NULL CHECK (amount_paise > 0),
  reason          text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  financial_year  text NOT NULL,
  number          text NOT NULL,                       -- CN/2026-27/000001
  created_by      text NOT NULL,
  created_by_name text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, financial_year, number)
);
CREATE INDEX IF NOT EXISTS credit_note_invoice ON credit_note (invoice_id);

DROP TRIGGER IF EXISTS credit_note_append_only ON credit_note;
CREATE TRIGGER credit_note_append_only BEFORE UPDATE OR DELETE ON credit_note
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE OR REPLACE FUNCTION guard_credit_note() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inv invoice%ROWTYPE; already bigint;
BEGIN
  SELECT * INTO inv FROM invoice WHERE id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND OR inv.organization_id <> NEW.organization_id OR inv.patient_id <> NEW.patient_id THEN
    RAISE EXCEPTION 'credit note does not match its invoice' USING ERRCODE = 'P0005';
  END IF;
  IF inv.status <> 'ISSUED' THEN
    RAISE EXCEPTION 'only issued invoices can be credited' USING ERRCODE = 'P0005';
  END IF;
  SELECT COALESCE(sum(amount_paise), 0) INTO already FROM credit_note WHERE invoice_id = NEW.invoice_id;
  IF already + NEW.amount_paise > inv.total_paise THEN
    RAISE EXCEPTION 'credit notes exceed the invoice total' USING ERRCODE = 'P0005';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS credit_note_guard ON credit_note;
CREATE TRIGGER credit_note_guard BEFORE INSERT ON credit_note
  FOR EACH ROW EXECUTE FUNCTION guard_credit_note();

-- ───────────────────────── Balances ─────────────────────────
-- Same columns as before, in the same order, with the new term appended.
-- Net liability is the invoice total less its credit notes.
CREATE OR REPLACE VIEW invoice_balance AS
SELECT i.id AS invoice_id,
       i.organization_id,
       i.patient_id,
       (i.total_paise - COALESCE(c.credited, 0))::bigint AS net_liability_paise,
       COALESCE(a.net, 0)::bigint AS net_allocated_paise,
       GREATEST(0, i.total_paise - COALESCE(c.credited, 0) - COALESCE(a.net, 0))::bigint AS amount_due_paise,
       GREATEST(0, COALESCE(a.net, 0) - (i.total_paise - COALESCE(c.credited, 0)))::bigint AS excess_paise,
       COALESCE(c.credited, 0)::bigint AS credited_paise
FROM invoice i
LEFT JOIN (SELECT invoice_id, sum(CASE WHEN kind = 'ALLOCATE' THEN amount_paise ELSE -amount_paise END) AS net
             FROM payment_allocation GROUP BY invoice_id) a ON a.invoice_id = i.id
LEFT JOIN (SELECT invoice_id, sum(amount_paise) AS credited FROM credit_note GROUP BY invoice_id) c ON c.invoice_id = i.id
WHERE i.status = 'ISSUED';

-- Unallocated funds are what is left after allocations AND refunds.
CREATE OR REPLACE VIEW payment_funds AS
SELECT p.id AS payment_id,
       p.amount_paise,
       COALESCE(a.net, 0)::bigint AS allocated_paise,
       (p.amount_paise - COALESCE(a.net, 0) - COALESCE(r.refunded, 0))::bigint AS unallocated_paise,
       COALESCE(r.refunded, 0)::bigint AS refunded_paise
FROM payment p
LEFT JOIN (SELECT payment_id, sum(CASE WHEN kind = 'ALLOCATE' THEN amount_paise ELSE -amount_paise END) AS net
             FROM payment_allocation GROUP BY payment_id) a ON a.payment_id = p.id
LEFT JOIN (SELECT payment_id, sum(amount_paise) AS refunded FROM payment_refund GROUP BY payment_id) r ON r.payment_id = p.id;

-- A reversed entry must not block the corrected payment that reuses its UTR.
DROP INDEX IF EXISTS payment_reference_unique;
CREATE UNIQUE INDEX payment_reference_unique ON payment (organization_id, method, reference)
  WHERE reference IS NOT NULL AND status NOT IN ('FAILED','CANCELLED','REVERSED');
