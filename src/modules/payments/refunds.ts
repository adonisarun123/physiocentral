import { z } from "zod";
import { tx, q, q1, type Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit } from "@/modules/audit";
import { assertPermission, type Actor } from "@/modules/auth/actor";
import { financialYear, parseRupeesToPaise } from "@/modules/billing/money";
import { formatOpNumber, todayInZone } from "@/lib/format";

export const refundSchema = z.object({
  paymentId: z.string().uuid(),
  amountRupees: z.string().trim().min(1, "Enter an amount"),
  method: z.enum(["CASH", "UPI_MANUAL", "BANK_TRANSFER"]),
  refundedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date the money was paid back"),
  paidFrom: z.string().trim().min(2, "Name the cash drawer or bank account").max(100),
  reference: z.string().trim().max(100).optional(),
  reason: z.string().trim().min(3, "Give a reason for the refund").max(300),
  appointmentId: z.string().uuid().optional().or(z.literal("")),
  creditBills: z.boolean().default(true),
});

export interface RefundSnapshot {
  number: string; issuedAt: string; clinic: string; paidTo: string; patientRef: string;
  amountPaise: string; method: string; reference: string | null; refundedOn: string; paidFrom: string; reason: string;
  approvedBy: string;
  payment: { receiptNumber: string | null; amountPaise: string; method: string; receivedOn: string; refundedBeforePaise: string };
  bills: { invoiceNumber: string; releasedPaise: string; creditNoteNumber: string | null }[];
}

/** How a payment reads to staff once refunds are taken into account. The stored status is never rewritten. */
export function paymentDisplayStatus(status: string, amountPaise: string | bigint, refundedPaise: string | bigint): string {
  if (status !== "VERIFIED") return status;
  const refunded = BigInt(refundedPaise);
  if (refunded <= 0n) return status;
  return refunded >= BigInt(amountPaise) ? "REFUNDED" : "PART_REFUNDED";
}

async function nextNumber(db: Db, orgId: string, series: "RFD" | "CN", fy: string) {
  const seq = (await q1<{ allocated: number }>(
    `INSERT INTO document_sequence (organization_id, series, financial_year, next_value) VALUES ($1,$2,$3,2)
     ON CONFLICT (organization_id, series, financial_year) DO UPDATE SET next_value = document_sequence.next_value + 1
     RETURNING next_value - 1 AS allocated`, [orgId, series, fy], db))!;
  return `${series}/${fy}/${String(seq.allocated).padStart(6, "0")}`;
}

/** Bills this payment is currently applied to, most recently applied first. Locks each bill. */
async function lockAppliedBills(db: Db, paymentId: string) {
  const rows = await q<{ invoice_id: string; number: string; status: string; net: string }>(
    `SELECT a.invoice_id, i.number, i.status,
            sum(CASE WHEN a.kind='ALLOCATE' THEN a.amount_paise ELSE -a.amount_paise END)::text net
       FROM payment_allocation a JOIN invoice i ON i.id=a.invoice_id
      WHERE a.payment_id=$1
      GROUP BY a.invoice_id, i.number, i.status
     HAVING sum(CASE WHEN a.kind='ALLOCATE' THEN a.amount_paise ELSE -a.amount_paise END) > 0
      ORDER BY max(a.created_at) DESC, a.invoice_id`, [paymentId], db);
  for (const r of rows) await db.query(`SELECT id FROM invoice WHERE id=$1 FOR UPDATE`, [r.invoice_id]);
  return rows;
}

/**
 * Pay money back to a patient, in full or in part. The original payment and its
 * receipt are left untouched; the refund is its own numbered record carrying the
 * staff member who approved it.
 *
 * Money that was already applied to a bill is taken back off that bill. With
 * `creditBills` (the default) the bill is reduced by the same amount through a
 * credit note, so a refunded visit does not keep showing an amount due. Without
 * it the bill simply becomes unpaid again.
 */
export async function refundPayment(actor: Actor, raw: unknown, correlationId: string) {
  assertPermission(actor, "PAYMENT_REFUND");
  const parsed = refundSchema.safeParse(raw);
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
    throw new DomainError("VALIDATION", "Enter a valid amount, e.g. 400 or 400.50", { amountRupees: "Invalid amount" });
  }
  if (amount <= 0n) throw new DomainError("VALIDATION", "Amount must be more than zero.", { amountRupees: "Must be more than zero" });
  if (input.method !== "CASH" && !input.reference) {
    throw new DomainError("VALIDATION", "A UTR / transaction reference is required for UPI and bank refunds.", { reference: "Required" });
  }

  return tx(async (db) => {
    const p = await q1<{ id: string; status: string; patient_id: string; amount_paise: string; method: string; received_on: string }>(
      `SELECT id, status, patient_id, amount_paise, method, to_char(received_on,'YYYY-MM-DD') received_on
         FROM payment WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [input.paymentId, actor.organizationId], db);
    if (!p) throw new DomainError("NOT_FOUND", "Payment not found.");
    if (p.status !== "VERIFIED") {
      throw new DomainError("INVALID_TRANSITION", p.status === "PENDING"
        ? "This payment is not verified yet, so there is nothing to refund."
        : `This payment is ${p.status.toLowerCase()} and cannot be refunded.`);
    }
    const org = (await q1<{ timezone: string; trade_name: string }>(`SELECT timezone, trade_name FROM organization WHERE id=$1`, [actor.organizationId], db))!;
    if (input.refundedOn > todayInZone(org.timezone)) throw new DomainError("VALIDATION", "The refund date cannot be in the future.", { refundedOn: "In the future" });
    if (input.refundedOn < p.received_on) throw new DomainError("VALIDATION", "The refund date cannot be before the payment was received.", { refundedOn: "Before the payment" });

    const funds = (await q1<{ unallocated_paise: string; refunded_paise: string }>(
      `SELECT unallocated_paise::text, refunded_paise::text FROM payment_funds WHERE payment_id=$1`, [p.id], db))!;
    const refundable = BigInt(p.amount_paise) - BigInt(funds.refunded_paise);
    if (refundable <= 0n) throw new DomainError("INSUFFICIENT_FUNDS", "This payment has already been refunded in full.");
    if (amount > refundable) {
      throw new DomainError("INSUFFICIENT_FUNDS", `Only ₹${(Number(refundable) / 100).toFixed(2)} of this payment is left to refund.`, { amountRupees: "Too much" });
    }

    let appointmentId: string | null = null;
    if (input.appointmentId) {
      const appt = await q1<{ id: string }>(`SELECT id FROM appointment WHERE id=$1 AND organization_id=$2 AND patient_id=$3`,
        [input.appointmentId, actor.organizationId, p.patient_id], db);
      if (!appt) throw new DomainError("NOT_FOUND", "That appointment does not belong to this patient.");
      appointmentId = appt.id;
    }

    // Take back from bills only what the unapplied part of the payment cannot cover.
    let shortfall = amount - BigInt(funds.unallocated_paise);
    const released: { invoiceId: string; invoiceNumber: string; paise: bigint; credit: boolean }[] = [];
    if (shortfall > 0n) {
      for (const b of await lockAppliedBills(db, p.id)) {
        if (shortfall <= 0n) break;
        const take = BigInt(b.net) < shortfall ? BigInt(b.net) : shortfall;
        await db.query(`INSERT INTO payment_allocation (payment_id, invoice_id, kind, amount_paise, created_by) VALUES ($1,$2,'RELEASE',$3,$4)`,
          [p.id, b.invoice_id, take.toString(), actor.label]);
        released.push({ invoiceId: b.invoice_id, invoiceNumber: b.number, paise: take, credit: input.creditBills && b.status === "ISSUED" });
        shortfall -= take;
      }
      if (shortfall > 0n) throw new DomainError("INSUFFICIENT_FUNDS", "This payment's funds could not be freed for a refund. Nothing was changed.");
    }

    const fy = financialYear(new Date(), org.timezone);
    const number = await nextNumber(db, actor.organizationId, "RFD", fy);
    const credits: { invoiceId: string; number: string; paise: bigint }[] = [];
    for (const r of released) if (r.credit) credits.push({ invoiceId: r.invoiceId, number: await nextNumber(db, actor.organizationId, "CN", fy), paise: r.paise });

    const patient = (await q1<{ full_name: string; public_ref: string; op_number: number | null }>(
      `SELECT full_name, public_ref, op_number FROM patient WHERE id=$1`, [p.patient_id], db))!;
    const receipt = await q1<{ number: string }>(`SELECT number FROM receipt WHERE payment_id=$1`, [p.id], db);
    const snapshot: RefundSnapshot = {
      number, issuedAt: new Date().toISOString(), clinic: org.trade_name,
      paidTo: patient.full_name, patientRef: formatOpNumber(patient.op_number) ?? patient.public_ref,
      amountPaise: amount.toString(), method: input.method, reference: input.reference || null,
      refundedOn: input.refundedOn, paidFrom: input.paidFrom, reason: input.reason,
      approvedBy: actor.displayName,
      payment: { receiptNumber: receipt?.number ?? null, amountPaise: p.amount_paise, method: p.method, receivedOn: p.received_on, refundedBeforePaise: funds.refunded_paise },
      bills: released.map((r) => ({ invoiceNumber: r.invoiceNumber, releasedPaise: r.paise.toString(), creditNoteNumber: credits.find((c) => c.invoiceId === r.invoiceId)?.number ?? null })),
    };
    const refund = (await q1<{ id: string }>(
      `INSERT INTO payment_refund (organization_id, payment_id, patient_id, appointment_id, amount_paise, method, reference, refunded_on,
         paid_from, reason, approved_by, approved_by_name, financial_year, number, snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [actor.organizationId, p.id, p.patient_id, appointmentId, amount.toString(), input.method, input.reference || null, input.refundedOn,
       input.paidFrom, input.reason, actor.label, actor.displayName, fy, number, JSON.stringify(snapshot)], db))!;
    for (const c of credits) {
      await db.query(
        `INSERT INTO credit_note (organization_id, invoice_id, patient_id, refund_id, amount_paise, reason, financial_year, number, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [actor.organizationId, c.invoiceId, p.patient_id, refund.id, c.paise.toString(), input.reason, fy, c.number, actor.label, actor.displayName]);
    }
    await audit(db, {
      organizationId: actor.organizationId, actor: actor.label, action: "payment.refund", targetType: "payment", targetId: p.id,
      changes: { refundId: refund.id, number, amount: amount.toString(), method: input.method, approvedBy: actor.displayName,
        released: released.map((r) => ({ invoice: r.invoiceNumber, amount: r.paise.toString() })), creditNotes: credits.map((c) => c.number) },
      reason: input.reason, correlationId,
    });
    return {
      refundId: refund.id, number, patientId: p.patient_id, fullyRefunded: amount === refundable,
      releasedFrom: released.map((r) => r.invoiceNumber), creditNotes: credits.map((c) => c.number),
    };
  });
}

/**
 * Undo a verified payment that should never have been entered (wrong patient,
 * wrong amount, money that did not arrive). No money is paid back — use a
 * refund for that. Bills it was applied to become unpaid again.
 */
export async function reversePayment(actor: Actor, input: { paymentId: string; reason: string }, correlationId: string) {
  assertPermission(actor, "PAYMENT_VERIFY");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new DomainError("VALIDATION", "Say why this entry is being reversed.", { reason: "Required" });
  if (reason.length > 300) throw new DomainError("VALIDATION", "Keep the reason under 300 characters.", { reason: "Too long" });
  return tx(async (db) => {
    const p = await q1<{ id: string; status: string }>(
      `SELECT id, status FROM payment WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [input.paymentId, actor.organizationId], db);
    if (!p) throw new DomainError("NOT_FOUND", "Payment not found.");
    if (p.status !== "VERIFIED") throw new DomainError("INVALID_TRANSITION", `Only verified payments can be reversed (this one is ${p.status.toLowerCase()}).`);
    const refunds = (await q1<{ n: string }>(`SELECT count(*)::text n FROM payment_refund WHERE payment_id=$1`, [p.id], db))!;
    if (refunds.n !== "0") throw new DomainError("INVALID_TRANSITION", "Money from this payment has been refunded, so it is a real payment and cannot be reversed.");
    const bills = await lockAppliedBills(db, p.id);
    for (const b of bills) {
      await db.query(`INSERT INTO payment_allocation (payment_id, invoice_id, kind, amount_paise, created_by) VALUES ($1,$2,'RELEASE',$3,$4)`,
        [p.id, b.invoice_id, b.net, actor.label]);
    }
    await db.query(`UPDATE payment SET status='REVERSED', reversed_by=$2, reversed_at=now(), reversal_reason=$3 WHERE id=$1`, [p.id, actor.label, reason]);
    await audit(db, {
      organizationId: actor.organizationId, actor: actor.label, action: "payment.reverse", targetType: "payment", targetId: p.id,
      changes: { reversedBy: actor.displayName, released: bills.map((b) => ({ invoice: b.number, amount: b.net })) }, reason, correlationId,
    });
    return { releasedFrom: bills.map((b) => b.number) };
  });
}
