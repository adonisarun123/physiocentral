import { tx, q, q1, pgErrorCode, type Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { sha256Json } from "@/lib/security/tokens";
import { audit, enqueue } from "@/modules/audit";
import { assertPermission, type Actor } from "@/modules/auth/actor";
import { PRIVACY_NOTICE_VERSION } from "@/modules/scheduling/booking";
import { computeLine, parseQuantityMilli, sumLines } from "./money";
import { currentPrice } from "./pricing";

const ESTIMATE_VALID_DAYS = 14;

/** Create an estimate with an empty DRAFT version 1 for an appointment. */
export async function createEstimate(actor: Actor, appointmentId: string, correlationId: string) {
  assertPermission(actor, "ESTIMATE_MANAGE");
  return tx(async (db) => {
    const appt = await q1<{ id: string; patient_id: string; organization_id: string }>(
      `SELECT id, patient_id, organization_id FROM appointment WHERE id = $1 AND organization_id = $2`,
      [appointmentId, actor.organizationId],
      db,
    );
    if (!appt) throw new DomainError("NOT_FOUND", "Appointment not found.");
    const est = (await q1<{ id: string }>(
      `INSERT INTO estimate (organization_id, patient_id, appointment_id, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
      [appt.organization_id, appt.patient_id, appt.id, actor.label],
      db,
    ))!;
    const ver = (await q1<{ id: string }>(
      `INSERT INTO estimate_version (estimate_id, version_no) VALUES ($1, 1) RETURNING id`,
      [est.id],
      db,
    ))!;
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "estimate.create", targetType: "estimate", targetId: est.id, correlationId });
    return { estimateId: est.id, versionId: ver.id };
  });
}

async function lockVersion(db: Db, versionId: string, orgId: string | null) {
  const v = await q1<{ id: string; estimate_id: string; status: string; version_no: number; organization_id: string; appointment_id: string | null; branch_id: string | null; valid_until: Date | null; content_hash: string | null; total_paise: string }>(
    `SELECT v.*, e.organization_id, e.appointment_id, a.branch_id
       FROM estimate_version v JOIN estimate e ON e.id = v.estimate_id
       LEFT JOIN appointment a ON a.id = e.appointment_id
      WHERE v.id = $1 FOR UPDATE OF v`,
    [versionId],
    db,
  );
  if (!v || (orgId && v.organization_id !== orgId)) throw new DomainError("NOT_FOUND", "Estimate not found.");
  return v;
}

/** Add a catalog line at the server's current price (COST-02: no custom items in this release). */
export async function addEstimateLine(
  actor: Actor,
  input: { versionId: string; serviceId: string; quantity: string; isExtra: boolean; reason?: string },
  correlationId: string,
) {
  assertPermission(actor, "ESTIMATE_MANAGE");
  const qty = parseQuantityMilli(input.quantity);
  if (input.isExtra && !input.reason?.trim()) {
    throw new DomainError("VALIDATION", "Give a reason for the additional charge.", { reason: "Required" });
  }
  return tx(async (db) => {
    const v = await lockVersion(db, input.versionId, actor.organizationId);
    if (v.status !== "DRAFT") throw new DomainError("INVALID_TRANSITION", "Sent versions are frozen. Create a new version to change lines.");
    const price = await currentPrice(db, input.serviceId, v.branch_id, actor.organizationId);
    if (!price) throw new DomainError("VALIDATION", "That service has no active price. Set a price version first.");
    const r = computeLine({
      quantityMilli: qty, unitPricePaise: BigInt(price.unit_price_paise), discountPaise: 0n,
      taxRateBp: price.tax_rate_bp, taxInclusive: price.tax_inclusive,
    });
    await db.query(
      `INSERT INTO estimate_line (estimate_version_id, service_id, description, quantity, unit_price_paise, tax_rate_bp,
         tax_inclusive, taxable_paise, tax_paise, total_paise, is_extra, reason)
       VALUES ($1,$2,$3,$4::numeric / 1000,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [v.id, price.service_id, price.bill_description || price.name, qty.toString(), price.unit_price_paise,
       price.tax_rate_bp, price.tax_inclusive, r.taxablePaise.toString(), r.taxPaise.toString(), r.totalPaise.toString(),
       input.isExtra, input.reason?.trim() || null],
    );
    await recomputeVersionTotals(db, v.id);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "estimate.line.add", targetType: "estimate_version", targetId: v.id, changes: { serviceId: price.service_id, qty: input.quantity }, correlationId });
  });
}

export async function removeEstimateLine(actor: Actor, lineId: string, correlationId: string) {
  assertPermission(actor, "ESTIMATE_MANAGE");
  return tx(async (db) => {
    const line = await q1<{ estimate_version_id: string }>(`SELECT estimate_version_id FROM estimate_line WHERE id=$1`, [lineId], db);
    if (!line) throw new DomainError("NOT_FOUND", "Line not found.");
    const v = await lockVersion(db, line.estimate_version_id, actor.organizationId);
    if (v.status !== "DRAFT") throw new DomainError("INVALID_TRANSITION", "Sent versions are frozen.");
    await db.query(`DELETE FROM estimate_line WHERE id=$1`, [lineId]);
    await recomputeVersionTotals(db, v.id);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "estimate.line.remove", targetType: "estimate_version", targetId: v.id, correlationId });
  });
}

async function recomputeVersionTotals(db: Db, versionId: string) {
  const lines = await q<{ taxable_paise: string; tax_paise: string; total_paise: string }>(
    `SELECT taxable_paise, tax_paise, total_paise FROM estimate_line WHERE estimate_version_id = $1`, [versionId], db);
  const t = sumLines(lines.map((l) => ({ grossPaise: 0n, taxablePaise: BigInt(l.taxable_paise), taxPaise: BigInt(l.tax_paise), totalPaise: BigInt(l.total_paise) })));
  await db.query(`UPDATE estimate_version SET subtotal_paise=$2, tax_paise=$3, total_paise=$4 WHERE id=$1`,
    [versionId, t.subtotalPaise.toString(), t.taxPaise.toString(), t.totalPaise.toString()]);
}

/** Canonical content of a version — what the patient is agreeing to. */
export async function versionContent(db: Db, versionId: string) {
  const v = await q1<{ id: string; estimate_id: string; version_no: number; subtotal_paise: string; tax_paise: string; total_paise: string; valid_until: Date | null; terms: string | null }>(
    `SELECT id, estimate_id, version_no, subtotal_paise, tax_paise, total_paise, valid_until, terms FROM estimate_version WHERE id=$1`, [versionId], db);
  const lines = await q<{ id: string; description: string; quantity: string; unit_price_paise: string; tax_rate_bp: number; tax_inclusive: boolean; total_paise: string; is_extra: boolean }>(
    `SELECT id, description, quantity::text, unit_price_paise, tax_rate_bp, tax_inclusive, total_paise, is_extra
       FROM estimate_line WHERE estimate_version_id=$1 ORDER BY sort_order, id`, [versionId], db);
  return { version: v, lines };
}

/** Freeze and send (§8.1). The content hash binds later approval to these exact terms. */
export async function sendEstimateVersion(actor: Actor, versionId: string, correlationId: string) {
  assertPermission(actor, "ESTIMATE_MANAGE");
  return tx(async (db) => {
    const v = await lockVersion(db, versionId, actor.organizationId);
    if (v.status !== "DRAFT") throw new DomainError("INVALID_TRANSITION", "Only drafts can be sent.");
    const cnt = await q1<{ n: string }>(`SELECT count(*) AS n FROM estimate_line WHERE estimate_version_id=$1`, [v.id], db);
    if (Number(cnt?.n ?? 0) === 0) throw new DomainError("VALIDATION", "Add at least one line before sending.");
    await db.query(
      `UPDATE estimate_version SET valid_until = now() + make_interval(days => $2),
              terms = COALESCE(terms, 'Estimate valid until the date shown. Prices in INR. Final bill reflects services actually provided.')
        WHERE id=$1`,
      [v.id, ESTIMATE_VALID_DAYS],
    );
    const content = await versionContent(db, v.id);
    const hash = sha256Json(content);
    await db.query(`UPDATE estimate_version SET status='SENT', sent_at=now(), content_hash=$2 WHERE id=$1`, [v.id, hash]);
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "estimate.send", targetType: "estimate_version", targetId: v.id, changes: { hash }, correlationId });
    await enqueue(db, "estimate.sent", `estimate.sent:${v.id}`, { estimateVersionId: v.id });
    return { contentHash: hash };
  });
}

/** Copy a version into a new DRAFT and supersede the old one (COST: material change → new version). */
export async function reviseEstimate(actor: Actor, versionId: string, correlationId: string) {
  assertPermission(actor, "ESTIMATE_MANAGE");
  return tx(async (db) => {
    const v = await lockVersion(db, versionId, actor.organizationId);
    if (v.status === "DRAFT") throw new DomainError("INVALID_TRANSITION", "This version is still a draft; edit it directly.");
    const latest = await q1<{ max: number }>(`SELECT max(version_no) AS max FROM estimate_version WHERE estimate_id=$1`, [v.estimate_id], db);
    if (latest!.max !== v.version_no) throw new DomainError("STALE_VERSION", "A newer version already exists.");
    const nv = (await q1<{ id: string }>(
      `INSERT INTO estimate_version (estimate_id, version_no) VALUES ($1,$2) RETURNING id`, [v.estimate_id, v.version_no + 1], db))!;
    await db.query(
      `INSERT INTO estimate_line (estimate_version_id, service_id, description, quantity, unit_price_paise, discount_paise, tax_rate_bp,
         tax_inclusive, taxable_paise, tax_paise, total_paise, is_extra, reason, sort_order)
       SELECT $2, service_id, description, quantity, unit_price_paise, discount_paise, tax_rate_bp, tax_inclusive,
              taxable_paise, tax_paise, total_paise, is_extra, reason, sort_order
         FROM estimate_line WHERE estimate_version_id = $1`,
      [v.id, nv.id],
    );
    await recomputeVersionTotals(db, nv.id);
    if (["SENT", "ACCEPTED"].includes(v.status)) {
      await db.query(`UPDATE estimate_version SET status='SUPERSEDED' WHERE id=$1`, [v.id]);
    }
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "estimate.revise", targetType: "estimate_version", targetId: nv.id, changes: { from: v.id }, correlationId });
    return { versionId: nv.id };
  });
}

/**
 * Record the patient's decision on an exact version (§8.1). Online via secure
 * link, or staff-recorded offline with attestation. Staff cannot tick a box
 * "as the patient" without the offline-approval permission and attestation.
 */
export async function decideEstimate(
  actor: Actor,
  input: {
    versionId: string;
    decision: "ACCEPTED" | "DECLINED";
    contentHash: string;
    method: "SECURE_LINK" | "STAFF_RECORDED_IN_PERSON" | "STAFF_RECORDED_PHONE";
    attestation?: string;
  },
  correlationId: string,
) {
  if (input.method === "SECURE_LINK") {
    if (actor.kind !== "patient_link") throw new DomainError("FORBIDDEN", "Not permitted.");
  } else {
    assertPermission(actor, "ESTIMATE_RECORD_OFFLINE_APPROVAL");
    if (!input.attestation?.trim() || input.attestation.trim().length < 10) {
      throw new DomainError("VALIDATION", "Describe how and when the patient confirmed.", { attestation: "Required" });
    }
  }
  return tx(async (db) => {
    const v = await lockVersion(db, input.versionId, actor.kind === "staff" ? actor.organizationId : null);
    if (actor.kind === "patient_link" && v.appointment_id !== actor.appointmentId) throw new DomainError("NOT_FOUND", "Estimate not found.");
    if (v.status !== "SENT") throw new DomainError("INVALID_TRANSITION", "This estimate version can no longer be answered. It may have been replaced.");
    if (v.valid_until && new Date(v.valid_until).getTime() < Date.now()) {
      await db.query(`UPDATE estimate_version SET status='EXPIRED' WHERE id=$1`, [v.id]);
      throw new DomainError("INVALID_TRANSITION", "This estimate has expired. Please ask the clinic for an updated one.");
    }
    if (v.content_hash !== input.contentHash) {
      throw new DomainError("STALE_VERSION", "The estimate changed since you opened it. Reload to review the latest terms.");
    }
    try {
      await db.query(
        `INSERT INTO estimate_approval (estimate_version_id, decision, method, content_hash, actor, attestation, notice_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [v.id, input.decision, input.method, v.content_hash, actor.label, input.attestation?.trim() || null, PRIVACY_NOTICE_VERSION],
      );
    } catch (e) {
      if (pgErrorCode(e) === "23505") throw new DomainError("INVALID_TRANSITION", "A decision was already recorded.");
      throw e;
    }
    await db.query(`UPDATE estimate_version SET status=$2 WHERE id=$1`, [v.id, input.decision]);
    await audit(db, { organizationId: v.organization_id, actor: actor.label, action: `estimate.${input.decision.toLowerCase()}`, targetType: "estimate_version", targetId: v.id, changes: { method: input.method, hash: v.content_hash }, correlationId });
  });
}

/** Accepted ≠ performed (COST-05): staff confirm delivery, creating a billable charge once. */
export async function markEstimateLinePerformed(actor: Actor, lineId: string, correlationId: string) {
  assertPermission(actor, "APPOINTMENT_TRANSITION");
  return tx(async (db) => {
    const line = await q1<{ id: string; estimate_version_id: string; service_id: string | null; description: string; quantity: string; unit_price_paise: string; discount_paise: string; tax_rate_bp: number; tax_inclusive: boolean }>(
      `SELECT * FROM estimate_line WHERE id=$1`, [lineId], db);
    if (!line) throw new DomainError("NOT_FOUND", "Line not found.");
    const v = await lockVersion(db, line.estimate_version_id, actor.organizationId);
    if (v.status !== "ACCEPTED") throw new DomainError("INVALID_TRANSITION", "Only lines on an accepted estimate can be billed (UAT-12).");
    const est = (await q1<{ patient_id: string; appointment_id: string | null }>(`SELECT patient_id, appointment_id FROM estimate WHERE id=$1`, [v.estimate_id], db))!;
    const unit = await q1<{ billing_unit: string }>(`SELECT billing_unit FROM service WHERE id=$1`, [line.service_id], db);
    try {
      const row = await q1<{ id: string }>(
        `INSERT INTO billable_charge (organization_id, patient_id, appointment_id, service_id, estimate_line_id, description, billing_unit,
           quantity, unit_price_paise, discount_paise, tax_rate_bp, tax_inclusive, performed_verified_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [v.organization_id, est.patient_id, est.appointment_id, line.service_id, line.id, line.description, unit?.billing_unit ?? "Item",
         line.quantity, line.unit_price_paise, line.discount_paise, line.tax_rate_bp, line.tax_inclusive, actor.label],
        db,
      );
      await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "charge.create.from_estimate", targetType: "billable_charge", targetId: row!.id, correlationId });
      return { chargeId: row!.id };
    } catch (e) {
      if (pgErrorCode(e) === "23505") throw new DomainError("ALREADY_BILLED", "This line was already recorded as performed.");
      throw e;
    }
  });
}
