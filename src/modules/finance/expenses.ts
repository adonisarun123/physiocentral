import { q, q1, tx } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit } from "@/modules/audit";
import { assertPermission, type Actor, type StaffActor } from "@/modules/auth/actor";
import { parseRupeesToPaise } from "@/modules/billing/money";
import { todayInZone } from "@/lib/format";
import { EXPENSE_CATEGORIES, PAID_VIA } from "./expense-constants";

export { EXPENSE_CATEGORIES, PAID_VIA, categoryLabel, paidViaLabel } from "./expense-constants";

/**
 * Clinic spending, so the reports can show profit. Cash basis: an expense
 * counts on the day it was paid. Entries are never edited or deleted; a wrong
 * entry is voided (with a reason) and entered again.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface ExpenseInput {
  spentOn: string;
  category: string;
  amountRupees: string;
  paidVia: string;
  payee?: string;
  note?: string;
}

export async function recordExpense(actor: Actor, input: ExpenseInput, correlationId: string) {
  assertPermission(actor, "EXPENSE_RECORD");
  const fe: Record<string, string> = {};
  const today = todayInZone();
  if (!ISO.test(input.spentOn) || Number.isNaN(Date.parse(`${input.spentOn}T00:00:00Z`))) fe.spentOn = "Enter the date paid";
  else if (input.spentOn > today) fe.spentOn = "Can't be a future date";
  if (!EXPENSE_CATEGORIES.some(([k]) => k === input.category)) fe.category = "Choose a category";
  if (!PAID_VIA.some(([k]) => k === input.paidVia)) fe.paidVia = "Choose how it was paid";
  let amount = 0n;
  try { amount = parseRupeesToPaise(input.amountRupees); } catch { fe.amountRupees = "Enter an amount, e.g. 1500 or 1500.50"; }
  if (!fe.amountRupees && amount <= 0n) fe.amountRupees = "Must be more than zero";
  if (!fe.amountRupees && amount > 100000000000n) fe.amountRupees = "That amount looks too large";
  const payee = input.payee?.trim().slice(0, 120) || null;
  const note = input.note?.trim().slice(0, 500) || null;
  if (input.category === "OTHER" && !note && !payee) fe.note = "Say what this was for";
  if (Object.keys(fe).length) throw new DomainError("VALIDATION", "Please correct the highlighted fields.", fe);

  return tx(async (db) => {
    const row = (await q1<{ id: string }>(
      `INSERT INTO expense (organization_id, spent_on, category, amount_paise, paid_via, payee, note, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [actor.organizationId, input.spentOn, input.category, amount.toString(), input.paidVia, payee, note, actor.label], db))!;
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "expense.record", targetType: "expense", targetId: row.id,
      changes: { category: input.category, amount: amount.toString(), spentOn: input.spentOn }, correlationId });
    return { expenseId: row.id, amountPaise: amount.toString() };
  });
}

export async function voidExpense(actor: Actor, input: { expenseId: string; reason: string }, correlationId: string) {
  assertPermission(actor, "EXPENSE_RECORD");
  assertPermission(actor, "FINANCE_VIEW");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new DomainError("VALIDATION", "Give a reason for voiding this entry.", { reason: "Required" });
  if (!/^[0-9a-f-]{36}$/i.test(input.expenseId)) throw new DomainError("NOT_FOUND", "Expense not found.");
  return tx(async (db) => {
    const e = await q1<{ id: string; status: string }>(
      `SELECT id, status FROM expense WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [input.expenseId, actor.organizationId], db);
    if (!e) throw new DomainError("NOT_FOUND", "Expense not found.");
    if (e.status === "VOIDED") throw new DomainError("INVALID_TRANSITION", "This entry is already voided.");
    await q(`UPDATE expense SET status='VOIDED', voided_by=$2, voided_at=now(), void_reason=$3 WHERE id=$1`, [e.id, actor.label, reason.slice(0, 500)], db);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "expense.void", targetType: "expense", targetId: e.id, reason, correlationId });
  });
}

export interface ExpenseRow {
  id: string; spent_on: string; category: string; amount_paise: string; paid_via: string; payee: string | null; note: string | null;
  status: string; recorded_by_name: string | null; created_at: Date; void_reason: string | null;
}

/** Expenses in a date range (both ends inclusive), newest first. Voided entries are listed but never counted. */
export function listExpenses(actor: StaffActor, from: string, to: string) {
  assertPermission(actor, "EXPENSE_RECORD");
  return q<ExpenseRow>(
    `SELECT e.id, to_char(e.spent_on,'YYYY-MM-DD') spent_on, e.category, e.amount_paise::text, e.paid_via, e.payee, e.note, e.status,
            s.display_name recorded_by_name, e.created_at, e.void_reason
       FROM expense e LEFT JOIN staff_member s ON e.recorded_by = 'staff:' || s.id::text
      WHERE e.organization_id=$1 AND e.spent_on BETWEEN $2::date AND $3::date
      ORDER BY e.spent_on DESC, e.created_at DESC LIMIT 500`,
    [actor.organizationId, from, to]);
}
