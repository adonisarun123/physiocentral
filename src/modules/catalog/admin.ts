import { tx, q1, pgErrorCode } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audit } from "@/modules/audit";
import { assertPermission, type Actor } from "@/modules/auth/actor";
import { parseRupeesToPaise } from "@/modules/billing/money";
import { slugify } from "@/lib/slug";

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

export interface ServiceDetailsInput {
  name: string;
  categoryId?: string | null;
  durationMinutes: number;
  billingUnit: string;
  summary?: string;
  headline?: string;
  body?: string;
  whoItMayHelp?: string;
  conditions?: string[];
}

function checkDetails(i: ServiceDetailsInput) {
  const name = i.name.trim();
  if (name.length < 3) throw new DomainError("VALIDATION", "Enter a service name.", { name: "Required" });
  if (!Number.isInteger(i.durationMinutes) || i.durationMinutes < 5 || i.durationMinutes > 480) {
    throw new DomainError("VALIDATION", "Session length must be between 5 and 480 minutes.", { durationMinutes: "5–480" });
  }
  return {
    name,
    unit: i.billingUnit.trim() || "Session",
    conditions: (i.conditions ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 30),
  };
}

/**
 * Add a service. It starts as a DRAFT that is not public and not bookable —
 * staff set a price, then use "Status and visibility" (which requires a named
 * clinical reviewer to publish). Optionally every active physiotherapist is
 * marked as able to provide it so it can be booked straight away.
 */
export async function createService(
  actor: Actor,
  input: ServiceDetailsInput & { priceRupees?: string; allTherapists: boolean },
  correlationId: string,
) {
  assertPermission(actor, "CATALOG_MANAGE");
  const d = checkDetails(input);
  let pricePaise: bigint | null = null;
  if (input.priceRupees?.trim()) {
    if (!actor.permissions.has("PRICE_MANAGE")) throw new DomainError("FORBIDDEN", "You can add the service, but setting a price needs price permission. Leave the price blank.");
    try { pricePaise = parseRupeesToPaise(input.priceRupees); } catch { throw new DomainError("VALIDATION", "Enter a valid price.", { priceRupees: "Invalid" }); }
  }
  return tx(async (db) => {
    let slug = slugify(d.name);
    if (await q1(`SELECT 1 FROM service WHERE organization_id=$1 AND slug=$2`, [actor.organizationId, slug], db)) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const n = (await q1<{ n: number }>(`SELECT count(*)::int + 1 n FROM service WHERE organization_id=$1`, [actor.organizationId], db))!.n;
    const code = `PC-S${String(n).padStart(3, "0")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const svc = (await q1<{ id: string }>(
      `INSERT INTO service (organization_id, category_id, code, slug, name, status, public, bookable, billing_unit, duration_minutes,
         summary, headline, body, who_it_may_help, conditions, bill_description, fee_policy_text, content_status, sort_order)
       VALUES ($1,$2,$3,$4,$5,'DRAFT',false,false,$6,$7,$8,$9,$10,$11,$12,$5,
         'Fee confirmed after your assessment — you approve an itemised estimate before treatment.','DRAFT',200)
       RETURNING id`,
      [actor.organizationId, input.categoryId || null, code, slug, d.name, d.unit, input.durationMinutes,
       input.summary?.trim() || null, input.headline?.trim() || null, input.body?.trim() || null, input.whoItMayHelp?.trim() || null, d.conditions],
      db,
    ))!;
    await db.query(`INSERT INTO service_branch SELECT $1, id FROM branch WHERE organization_id=$2 ON CONFLICT DO NOTHING`, [svc.id, actor.organizationId]);
    if (input.allTherapists) {
      await db.query(`INSERT INTO therapist_skill SELECT id, $1 FROM therapist WHERE organization_id=$2 AND active ON CONFLICT DO NOTHING`, [svc.id, actor.organizationId]);
    }
    if (pricePaise !== null) {
      await db.query(
        `INSERT INTO service_price_version (service_id, valid_during, unit_price_paise, created_by) VALUES ($1, tstzrange(now(), NULL, '[)'), $2, $3)`,
        [svc.id, pricePaise.toString(), actor.label],
      );
    }
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "catalog.service.create", targetType: "service", targetId: svc.id, changes: { name: d.name, code, price: pricePaise?.toString() ?? null }, correlationId });
    return { serviceId: svc.id, code };
  });
}

/** Edit a service's descriptive details. Status/visibility and price have their own audited flows. */
export async function updateServiceDetails(actor: Actor, input: ServiceDetailsInput & { serviceId: string }, correlationId: string) {
  assertPermission(actor, "CATALOG_MANAGE");
  const d = checkDetails(input);
  return tx(async (db) => {
    const r = await q1<{ id: string }>(
      `UPDATE service SET name=$3, category_id=$4, duration_minutes=$5, billing_unit=$6, summary=$7, headline=$8, body=$9,
              who_it_may_help=$10, conditions=$11, version=version+1, updated_at=now()
        WHERE id=$1 AND organization_id=$2 RETURNING id`,
      [input.serviceId, actor.organizationId, d.name, input.categoryId || null, input.durationMinutes, d.unit,
       input.summary?.trim() || null, input.headline?.trim() || null, input.body?.trim() || null, input.whoItMayHelp?.trim() || null, d.conditions],
      db,
    );
    if (!r) throw new DomainError("NOT_FOUND", "Service not found.");
    await audit(db, { organizationId: actor.organizationId, actor: actor.label, action: "catalog.service.update", targetType: "service", targetId: r.id, changes: { name: d.name, durationMinutes: input.durationMinutes }, correlationId });
  });
}
