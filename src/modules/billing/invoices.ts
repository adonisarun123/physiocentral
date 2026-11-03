import { tx, q, q1, pgErrorCode, pgConstraint, type Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit, enqueue } from "@/modules/audit";
import { assertPermission, type Actor } from "@/modules/auth/actor";
import { computeLine, financialYear, parseQuantityMilli, sumLines, ROUNDING_POLICY } from "./money";

export const RENDERER_VERSION = "html-print-v1";

/**
 * Create a DRAFT invoice claiming the given billable charges. The unique index
 * invoice_line_charge_claim makes a charge billable on at most one invoice line,
 * across competing drafts (§9.1, UAT-34).
 */
export async function createDraftInvoice(
  actor: Actor,
  input: { patientId: string; chargeIds: string[]; appointmentId?: string | null },
  correlationId: string,
) {
  assertPermission(actor, "INVOICE_DRAFT");
  if (input.chargeIds.length === 0) throw new DomainError("VALIDATION", "Select at least one charge.");
  try {
    return await tx(async (db) => {
      const charges = await q<{
        id: string; patient_id: string; description: string; billing_unit: string; quantity: string;
        unit_price_paise: string; discount_paise: string; tax_rate_bp: number; tax_inclusive: boolean;
      }>(
        `SELECT id, patient_id, description, billing_unit, quantity::text, unit_price_paise, discount_paise, tax_rate_bp, tax_inclusive
           FROM billable_charge WHERE id = ANY($1::uuid[]) AND organization_id = $2 ORDER BY created_at, id`,
        [input.chargeIds, actor.organizationId],
        db,
      );
      if (charges.length !== new Set(input.chargeIds).size) throw new DomainError("NOT_FOUND", "One or more charges were not found.");
      if (charges.some((c) => c.patient_id !== input.patientId)) {
        throw new DomainError("VALIDATION", "All charges on one invoice must belong to the same patient.");
      }
      const inv = (await q1<{ id: string }>(
        `INSERT INTO invoice (organization_id, patient_id, appointment_id, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
        [actor.organizationId, input.patientId, input.appointmentId ?? null, actor.label],
        db,
      ))!;
      let i = 0;
      for (const c of charges) {
        const r = computeLine({
          quantityMilli: parseQuantityMilli(c.quantity),
          unitPricePaise: BigInt(c.unit_price_paise),
          discountPaise: BigInt(c.discount_paise),
          taxRateBp: c.tax_rate_bp,
          taxInclusive: c.tax_inclusive,
        });
        await db.query(
          `INSERT INTO invoice_line (invoice_id, billable_charge_id, description, billing_unit, quantity, unit_price_paise, discount_paise,
             tax_rate_bp, tax_inclusive, taxable_paise, tax_paise, total_paise, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [inv.id, c.id, c.description, c.billing_unit, c.quantity, c.unit_price_paise, c.discount_paise, c.tax_rate_bp,
           c.tax_inclusive, r.taxablePaise.toString(), r.taxPaise.toString(), r.totalPaise.toString(), i++],
        );
      }
      await recomputeInvoiceTotals(db, inv.id);
      await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "invoice.draft.create", targetType: "invoice", targetId: inv.id, changes: { charges: input.chargeIds }, correlationId });
      return { invoiceId: inv.id };
    });
  } catch (e) {
    if (pgErrorCode(e) === "23505" && pgConstraint(e) === "invoice_line_charge_claim") {
      throw new DomainError("ALREADY_BILLED", "One of these charges is already on another invoice or draft.");
    }
    throw e;
  }
}

async function recomputeInvoiceTotals(db: Db, invoiceId: string) {
  const lines = await q<{ taxable_paise: string; tax_paise: string; total_paise: string }>(
    `SELECT taxable_paise, tax_paise, total_paise FROM invoice_line WHERE invoice_id=$1`, [invoiceId], db);
  const t = sumLines(lines.map((l) => ({ grossPaise: 0n, taxablePaise: BigInt(l.taxable_paise), taxPaise: BigInt(l.tax_paise), totalPaise: BigInt(l.total_paise) })));
  await db.query(
    `UPDATE invoice SET subtotal_paise=$2, tax_paise=$3, total_paise=$4, version=version+1, updated_at=now() WHERE id=$1`,
    [invoiceId, t.subtotalPaise.toString(), t.taxPaise.toString(), t.totalPaise.toString()],
  );
}

/** Abandon a draft: explicitly releases its charge claims (§9.1). Issued invoices are protected by trigger. */
export async function discardDraftInvoice(actor: Actor, invoiceId: string, expectedVersion: number, correlationId: string) {
  assertPermission(actor, "INVOICE_DRAFT");
  return tx(async (db) => {
    const inv = await q1<{ id: string; status: string; version: number }>(
      `SELECT id, status, version FROM invoice WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [invoiceId, actor.organizationId], db);
    if (!inv) throw new DomainError("NOT_FOUND", "Invoice not found.");
    if (inv.status !== "DRAFT") throw new DomainError("INVALID_TRANSITION", "Issued invoices cannot be discarded. Use a correction document.");
    if (inv.version !== expectedVersion) throw new DomainError("STALE_VERSION", "This draft changed. Reload and try again.");
    await db.query(`DELETE FROM invoice_line WHERE invoice_id=$1`, [invoiceId]);
    await db.query(`DELETE FROM invoice WHERE id=$1`, [invoiceId]);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "invoice.draft.discard", targetType: "invoice", targetId: invoiceId, correlationId });
  });
}

/**
 * Issue (§9.1, §18.3): lock draft + number series in one transaction, validate,
 * freeze an immutable snapshot, allocate the financial-year number, enqueue PDF.
 */
export async function issueInvoice(actor: Actor, input: { invoiceId: string; expectedVersion: number }, correlationId: string) {
  assertPermission(actor, "INVOICE_ISSUE");
  return tx(async (db) => {
    const inv = await q1<{ id: string; status: string; version: number; patient_id: string; appointment_id: string | null; subtotal_paise: string; tax_paise: string; total_paise: string }>(
      `SELECT * FROM invoice WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [input.invoiceId, actor.organizationId], db);
    if (!inv) throw new DomainError("NOT_FOUND", "Invoice not found.");
    if (inv.status !== "DRAFT") throw new DomainError("INVALID_TRANSITION", "This invoice is already issued and cannot be edited (UAT-21).");
    if (inv.version !== input.expectedVersion) throw new DomainError("STALE_VERSION", "This draft changed since you opened it. Reload to review.");

    const lines = await q<{ description: string; billing_unit: string; quantity: string; unit_price_paise: string; discount_paise: string; tax_rate_bp: number; tax_inclusive: boolean; taxable_paise: string; tax_paise: string; total_paise: string }>(
      `SELECT description, billing_unit, quantity::text, unit_price_paise, discount_paise, tax_rate_bp, tax_inclusive, taxable_paise, tax_paise, total_paise
         FROM invoice_line WHERE invoice_id=$1 ORDER BY sort_order, id`, [inv.id], db);
    if (lines.length === 0) throw new DomainError("VALIDATION", "An invoice needs at least one line.");

    const org = (await q1<{ id: string; trade_name: string; legal_name: string | null; gst_registered: boolean; gstin: string | null; timezone: string; phone_e164: string | null; email: string | null; identity_verified: boolean }>(
      `SELECT * FROM organization WHERE id=$1`, [actor.organizationId], db))!;
    const hasTax = lines.some((l) => l.tax_rate_bp > 0);
    if (hasTax && !org.gst_registered) {
      throw new DomainError("VALIDATION", "Taxed lines require GST registration settings approved by the accountant (§9.3).");
    }
    const docType = !org.gst_registered ? "BILL" : hasTax ? "TAX_INVOICE" : "BILL_OF_SUPPLY";
    const patient = (await q1<{ full_name: string; public_ref: string }>(`SELECT full_name, public_ref FROM patient WHERE id=$1`, [inv.patient_id], db))!;
    const branch = inv.appointment_id
      ? await q1<{ name: string; address_line: string | null; city: string | null; phone_e164: string | null; starts_at: Date; public_ref: string }>(
          `SELECT b.name, b.address_line, b.city, b.phone_e164, a.starts_at, a.public_ref FROM appointment a JOIN branch b ON b.id=a.branch_id WHERE a.id=$1`,
          [inv.appointment_id], db)
      : undefined;

    const issuedAt = new Date();
    const fy = financialYear(issuedAt, org.timezone);
    const seq = (await q1<{ allocated: number }>(
      `INSERT INTO document_sequence (organization_id, series, financial_year, next_value) VALUES ($1,'INV',$2,2)
       ON CONFLICT (organization_id, series, financial_year) DO UPDATE SET next_value = document_sequence.next_value + 1
       RETURNING next_value - 1 AS allocated`,
      [actor.organizationId, fy], db))!;
    const number = `INV/${fy}/${String(seq.allocated).padStart(6, "0")}`;

    const snapshot = {
      documentType: docType,
      number,
      issuedAt: issuedAt.toISOString(),
      currency: "INR",
      supplier: {
        tradeName: org.trade_name, legalName: org.legal_name, gstin: org.gst_registered ? org.gstin : null,
        phone: org.phone_e164, email: org.email, identityVerified: org.identity_verified,
        branch: branch ? { name: branch.name, address: [branch.address_line, branch.city].filter(Boolean).join(", "), phone: branch.phone_e164 } : null,
      },
      billTo: { name: patient.full_name, patientRef: patient.public_ref },
      service: branch ? { appointmentRef: branch.public_ref, date: new Date(branch.starts_at).toISOString() } : null,
      lines,
      totals: { subtotalPaise: inv.subtotal_paise, taxPaise: inv.tax_paise, totalPaise: inv.total_paise },
      asOfIssue: { paymentsAppliedPaise: "0", balanceDuePaise: inv.total_paise },
      roundingPolicy: ROUNDING_POLICY,
      rendererVersion: RENDERER_VERSION,
    };

    await db.query(
      `UPDATE invoice SET status='ISSUED', number=$2, financial_year=$3, issued_at=$4, issued_by=$5, document_type=$6,
              snapshot=$7, renderer_version=$8, version=version+1, updated_at=now()
        WHERE id=$1`,
      [inv.id, number, fy, issuedAt, actor.label, docType, JSON.stringify(snapshot), RENDERER_VERSION],
    );
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "invoice.issue", targetType: "invoice", targetId: inv.id, changes: { number, total: inv.total_paise }, correlationId });
    await enqueue(db, "invoice.pdf", `invoice.pdf:${inv.id}`, { invoiceId: inv.id });
    return { number, financialYear: fy };
  });
}

export async function invoiceBalance(db: Db, invoiceId: string) {
  return q1<{ net_liability_paise: string; net_allocated_paise: string; amount_due_paise: string; excess_paise: string }>(
    `SELECT net_liability_paise, net_allocated_paise, amount_due_paise, excess_paise FROM invoice_balance WHERE invoice_id=$1`,
    [invoiceId], db);
}
