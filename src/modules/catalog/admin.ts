import { tx, q1, pgErrorCode } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit } from "@/modules/audit";
import { assertPermission, type Actor } from "@/modules/auth/actor";
import { parseRupeesToPaise } from "@/modules/billing/money";

/**
 * Add an effective-dated price version (§7.1). Prices never change in place;
 * the open-ended current version is closed at the new version's start, and
 * the exclusion constraint rejects any overlap. Accepted estimates and issued
 * invoices keep their own snapshots, so they are unaffected (UAT-11).
 */
export async function addPriceVersion(
  actor: Actor,
  input: { serviceId: string; amountRupees: string; effectiveFrom?: string | null; taxCategoryId?: string | null },
  correlationId: string,
) {
  assertPermission(actor, "PRICE_MANAGE");
  let paise: bigint;
  try { paise = parseRupeesToPaise(input.amountRupees); } catch { throw new DomainError("VALIDATION", "Enter a valid price.", { amountRupees: "Invalid" }); }
  try {
    return await tx(async (db) => {
      const svc = await q1<{ id: string }>(`SELECT id FROM service WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [input.serviceId, actor.organizationId], db);
      if (!svc) throw new DomainError("NOT_FOUND", "Service not found.");
      const from = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
      if (Number.isNaN(from.getTime())) throw new DomainError("VALIDATION", "Invalid effective date.");
      // Close the open-ended org-wide version that covers the new start.
      await db.query(
        `UPDATE service_price_version SET valid_during = tstzrange(lower(valid_during), $2::timestamptz, '[)')
          WHERE service_id=$1 AND branch_id IS NULL AND upper_inf(valid_during) AND lower(valid_during) < $2::timestamptz`,
        [svc.id, from],
      );
      const row = (await q1<{ id: string }>(
        `INSERT INTO service_price_version (service_id, valid_during, unit_price_paise, tax_category_id, created_by)
         VALUES ($1, tstzrange($2::timestamptz, NULL, '[)'), $3, $4, $5) RETURNING id`,
        [svc.id, from, paise.toString(), input.taxCategoryId || null, actor.label],
        db,
      ))!;
      await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "catalog.price.add", targetType: "service", targetId: svc.id, changes: { paise: paise.toString(), from: from.toISOString() }, correlationId });
      return { priceVersionId: row.id };
    });
  } catch (e) {
    if (pgErrorCode(e) === "23P01") throw new DomainError("VALIDATION", "This overlaps an existing price period (e.g. a future-dated price). Adjust the effective date.");
    throw e;
  }
}

/**
 * Status changes. Activating for public booking requires a clinical reviewer
 * and review date (DB check) — the app never invents clinical approval.
 */
export async function setServiceStatus(
  actor: Actor,
  input: { serviceId: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; public: boolean; bookable: boolean; clinicalReviewer?: string; reviewedOn?: string },
  correlationId: string,
) {
  assertPermission(actor, "CATALOG_MANAGE");
  try {
    return await tx(async (db) => {
      const r = await q1<{ id: string }>(
        `UPDATE service SET status=$3, public=$4, bookable=$5,
                clinical_reviewer = COALESCE(NULLIF($6,''), clinical_reviewer),
                reviewed_on = COALESCE(NULLIF($7,'')::date, reviewed_on),
                version = version + 1, updated_at = now()
          WHERE id=$1 AND organization_id=$2 RETURNING id`,
        [input.serviceId, actor.organizationId, input.status, input.public, input.bookable, input.clinicalReviewer ?? "", input.reviewedOn ?? ""],
        db,
      );
      if (!r) throw new DomainError("NOT_FOUND", "Service not found.");
      await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "catalog.service.status", targetType: "service", targetId: r.id, changes: { status: input.status, public: input.public, bookable: input.bookable }, correlationId });
    });
  } catch (e) {
    if (pgErrorCode(e) === "23514") {
      throw new DomainError("VALIDATION", "A public, active service needs a named clinical reviewer and review date.", { clinicalReviewer: "Required to publish" });
    }
    throw e;
  }
}
