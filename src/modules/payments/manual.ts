import { z } from "zod";
import { tx, q, q1, pgErrorCode, type Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit, enqueue } from "@/modules/audit";
import { assertPermission, type Actor, type StaffActor } from "@/modules/auth/actor";
import { financialYear, parseRupeesToPaise } from "@/modules/billing/money";

export const recordPaymentSchema = z.object({
  patientId: z.string().uuid(),
  method: z.enum(["CASH", "UPI_MANUAL", "BANK_TRANSFER"]),
  amountRupees: z.string().trim().min(1, "Enter an amount"),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date received"),
  receivingAccount: z.string().trim().min(2, "Name the cash drawer or bank account").max(100),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(300).optional(),
  intendedInvoiceId: z.string().uuid().optional().or(z.literal("")),
  verifyNow: z.boolean().default(false),
});

/**
 * "Mark paid" is a payment-recording dialog, not a checkbox (§10.1). A
 * receptionist can record a PENDING payment; only a holder of PAYMENT_VERIFY
 * can verify. Online gateway payments are not enabled in this release.
 */
export async function recordManualPayment(actor: Actor, raw: unknown, correlationId: string) {
  assertPermission(actor, "PAYMENT_RECORD");
  const parsed = recordPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[i.path.join(".")] ??= i.message;
    throw new DomainError("VALIDATION", "Please correct the highlighted fields.", fe);
  }
  const input = parsed.data;
  let amount: bigint;
  try {
    amount = parseRupeesToPaise(input.amountRupees);
  } catch {
    throw new DomainError("VALIDATION", "Enter a valid amount, e.g. 500 or 500.50", { amountRupees: "Invalid amount" });
  }
  if (amount <= 0n) throw new DomainError("VALIDATION", "Amount must be more than zero.", { amountRupees: "Must be more than zero" });
  if (input.method !== "CASH" && !input.reference) {
    throw new DomainError("VALIDATION", "A UTR / transaction reference is required for UPI and bank transfers.", { reference: "Required" });
  }
  if (input.verifyNow && !actor.permissions.has("PAYMENT_VERIFY")) {
    throw new DomainError("FORBIDDEN", "You can record this payment, but a designated verifier must verify it.");
  }

  try {
    return await tx(async (db) => {
      const patient = await q1<{ id: string }>(`SELECT id FROM patient WHERE id=$1 AND organization_id=$2`, [input.patientId, actor.organizationId], db);
      if (!patient) throw new DomainError("NOT_FOUND", "Patient not found.");
      const p = (await q1<{ id: string }>(
        `INSERT INTO payment (organization_id, patient_id, method, amount_paise, reference, received_on, receiving_account, note, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [actor.organizationId, input.patientId, input.method, amount.toString(), input.reference || null, input.receivedOn,
         input.receivingAccount, input.note || null, actor.label],
        db,
      ))!;
      await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "payment.record", targetType: "payment", targetId: p.id, changes: { method: input.method, amount: amount.toString() }, correlationId });
      let receiptNumber: string | null = null;
      if (input.verifyNow) {
        const r = await verifyInTx(db, actor, p.id, input.intendedInvoiceId || null, correlationId);
        receiptNumber = r.receiptNumber;
      }
      return { paymentId: p.id, receiptNumber };
    });
  } catch (e) {
    if (pgErrorCode(e) === "23505") throw new DomainError("VALIDATION", "A payment with this reference is already recorded.", { reference: "Duplicate reference" });
    throw e;
  }
}

export async function verifyPayment(actor: Actor, input: { paymentId: string; allocateToInvoiceId?: string | null }, correlationId: string) {
  assertPermission(actor, "PAYMENT_VERIFY");
  return tx((db) => verifyInTx(db, actor, input.paymentId, input.allocateToInvoiceId ?? null, correlationId));
}

async function verifyInTx(db: Db, actor: StaffActor, paymentId: string, allocateTo: string | null, correlationId: string) {
  assertPermission(actor, "PAYMENT_VERIFY");
  const p = await q1<{ id: string; status: string; organization_id: string; patient_id: string; amount_paise: string; method: string; reference: string | null; received_on: string }>(
    `SELECT * FROM payment WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [paymentId, actor.organizationId], db);
  if (!p) throw new DomainError("NOT_FOUND", "Payment not found.");
  if (p.status !== "PENDING") throw new DomainError("INVALID_TRANSITION", `This payment is already ${p.status.toLowerCase()}.`);
  await db.query(`UPDATE payment SET status='VERIFIED', verified_by=$2, verified_at=now() WHERE id=$1`, [p.id, actor.label]);
  await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "payment.verify", targetType: "payment", targetId: p.id, correlationId });

  if (allocateTo) {
    const due = await q1<{ amount_due_paise: string }>(`SELECT amount_due_paise FROM invoice_balance WHERE invoice_id=$1`, [allocateTo], db);
    const amt = due ? (BigInt(due.amount_due_paise) < BigInt(p.amount_paise) ? BigInt(due.amount_due_paise) : BigInt(p.amount_paise)) : 0n;
    if (amt > 0n) await allocateInTx(db, actor, p.id, allocateTo, amt, correlationId);
  }

  const org = (await q1<{ timezone: string; trade_name: string }>(`SELECT timezone, trade_name FROM organization WHERE id=$1`, [actor.organizationId], db))!;
  const fy = financialYear(new Date(), org.timezone);
  const seq = (await q1<{ allocated: number }>(
    `INSERT INTO document_sequence (organization_id, series, financial_year, next_value) VALUES ($1,'RCT',$2,2)
     ON CONFLICT (organization_id, series, financial_year) DO UPDATE SET next_value = document_sequence.next_value + 1
     RETURNING next_value - 1 AS allocated`, [actor.organizationId, fy], db))!;
  const number = `RCT/${fy}/${String(seq.allocated).padStart(6, "0")}`;
  const allocations = await q<{ invoice_number: string; amount_paise: string }>(
    `SELECT i.number AS invoice_number, a.amount_paise FROM payment_allocation a JOIN invoice i ON i.id=a.invoice_id
      WHERE a.payment_id=$1 AND a.kind='ALLOCATE' ORDER BY a.created_at`, [p.id], db);
  const patient = (await q1<{ full_name: string; public_ref: string }>(`SELECT full_name, public_ref FROM patient WHERE id=$1`, [p.patient_id], db))!;
  const snapshot = {
    number, issuedAt: new Date().toISOString(), clinic: org.trade_name,
    receivedFrom: patient.full_name, patientRef: patient.public_ref,
    kind: "PAYMENT", method: p.method, reference: p.reference, receivedOn: p.received_on,
    amountPaise: p.amount_paise, allocationsAtIssue: allocations,
  };
  await db.query(`INSERT INTO receipt (organization_id, payment_id, financial_year, number, snapshot) VALUES ($1,$2,$3,$4,$5)`,
    [actor.organizationId, p.id, fy, number, JSON.stringify(snapshot)]);
  await enqueue(db, "receipt.pdf", `receipt.pdf:${p.id}`, { paymentId: p.id });
  return { receiptNumber: number };
}

/**
 * Allocate verified funds to an issued invoice (§10.2). Locks payment then
 * invoice (consistent order). Cannot exceed unallocated funds or the amount due;
 * any surplus remains explicit unallocated credit.
 */
export async function allocatePayment(actor: Actor, input: { paymentId: string; invoiceId: string; amountRupees: string }, correlationId: string) {
  assertPermission(actor, "PAYMENT_ALLOCATE");
  let amount: bigint;
  try { amount = parseRupeesToPaise(input.amountRupees); } catch { throw new DomainError("VALIDATION", "Enter a valid amount."); }
  return tx((db) => allocateInTx(db, actor, input.paymentId, input.invoiceId, amount, correlationId));
}

async function allocateInTx(db: Db, actor: StaffActor, paymentId: string, invoiceId: string, amount: bigint, correlationId: string) {
  if (amount <= 0n) throw new DomainError("VALIDATION", "Amount must be more than zero.");
  const p = await q1<{ id: string; status: string; patient_id: string }>(
    `SELECT id, status, patient_id FROM payment WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [paymentId, actor.organizationId], db);
  if (!p) throw new DomainError("NOT_FOUND", "Payment not found.");
  if (p.status !== "VERIFIED") throw new DomainError("INVALID_TRANSITION", "Only verified payments can be allocated.");
  const inv = await q1<{ id: string; status: string; patient_id: string }>(
    `SELECT id, status, patient_id FROM invoice WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [invoiceId, actor.organizationId], db);
  if (!inv) throw new DomainError("NOT_FOUND", "Invoice not found.");
  if (inv.status !== "ISSUED") throw new DomainError("INVALID_TRANSITION", "Payments can only be allocated to issued invoices.");
  if (inv.patient_id !== p.patient_id) throw new DomainError("FORBIDDEN", "Cross-patient allocation needs a shared payer account, which is not configured.");
  const funds = (await q1<{ unallocated_paise: string }>(`SELECT unallocated_paise FROM payment_funds WHERE payment_id=$1`, [p.id], db))!;
  if (amount > BigInt(funds.unallocated_paise)) throw new DomainError("INSUFFICIENT_FUNDS", "That is more than the payment's unallocated amount.");
  const bal = (await q1<{ amount_due_paise: string }>(`SELECT amount_due_paise FROM invoice_balance WHERE invoice_id=$1`, [inv.id], db))!;
  if (amount > BigInt(bal.amount_due_paise)) throw new DomainError("VALIDATION", "That is more than the invoice's balance due. Leave the surplus as patient credit.");
  await db.query(`INSERT INTO payment_allocation (payment_id, invoice_id, kind, amount_paise, created_by) VALUES ($1,$2,'ALLOCATE',$3,$4)`,
    [p.id, inv.id, amount.toString(), actor.label]);
  await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "payment.allocate", targetType: "invoice", targetId: inv.id, changes: { paymentId: p.id, amount: amount.toString() }, correlationId });
}
