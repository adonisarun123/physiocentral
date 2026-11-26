-- 009_bill_discount.sql
-- Patient discounts on a bill, as a percentage or a rupee amount.
--
-- * Per-line discounts already exist (invoice_line.discount_paise, from the
--   billable charge). Staff can now enter them as a % as well as ₹; the result
--   is still stored in paise, so no schema change is needed for that.
-- * NEW: a discount on the whole bill, applied to a DRAFT before it is issued.
--   It is split across the lines in proportion to their amounts (so per-line
--   tax stays right) and added on top of each line's own discount. The columns
--   below record what was given, why and by whom, for the bill and the audit.
-- Only adds columns. The issued-invoice guard is extended so these fields are
-- frozen once a bill is issued, like the totals.

ALTER TABLE invoice ADD COLUMN IF NOT EXISTS bill_discount_type text
  CHECK (bill_discount_type IN ('PERCENT','AMOUNT'));
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS bill_discount_bp int
  CHECK (bill_discount_bp BETWEEN 1 AND 10000);
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS bill_discount_paise bigint NOT NULL DEFAULT 0
  CHECK (bill_discount_paise >= 0);
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS bill_discount_reason text
  CHECK (char_length(bill_discount_reason) <= 300);
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS bill_discount_by text;

DO $$ BEGIN
  ALTER TABLE invoice ADD CONSTRAINT invoice_bill_discount_shape CHECK (
    (bill_discount_type IS NULL AND bill_discount_paise = 0 AND bill_discount_bp IS NULL)
    OR (bill_discount_type = 'PERCENT' AND bill_discount_bp IS NOT NULL AND bill_discount_reason IS NOT NULL)
    OR (bill_discount_type = 'AMOUNT' AND bill_discount_bp IS NULL AND bill_discount_paise > 0 AND bill_discount_reason IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
       OR NEW.bill_discount_type IS DISTINCT FROM OLD.bill_discount_type
       OR NEW.bill_discount_bp IS DISTINCT FROM OLD.bill_discount_bp
       OR NEW.bill_discount_paise <> OLD.bill_discount_paise
       OR NEW.bill_discount_reason IS DISTINCT FROM OLD.bill_discount_reason
       OR (NEW.status = 'DRAFT') THEN
      RAISE EXCEPTION 'issued invoice % is immutable; use a credit note', OLD.id USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN NEW;
END $$;
