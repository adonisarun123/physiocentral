import { q1, type Db } from "@/lib/db";

export interface CurrentPrice {
  service_id: string;
  name: string;
  bill_description: string | null;
  billing_unit: string;
  unit_price_paise: string;
  tax_rate_bp: number;
  tax_inclusive: boolean;
  price_version_id: string;
}

/** Server-authoritative current price for a service at a branch (branch override wins). */
export async function currentPrice(db: Db, serviceId: string, branchId: string | null, orgId: string, at: Date = new Date()) {
  return q1<CurrentPrice>(
    `SELECT s.id AS service_id, s.name, s.bill_description, s.billing_unit,
            pv.unit_price_paise, COALESCE(tc.rate_bp, 0) AS tax_rate_bp, COALESCE(tc.price_inclusive, false) AS tax_inclusive,
            pv.id AS price_version_id
       FROM service s
       JOIN LATERAL (
         SELECT * FROM service_price_version p
          WHERE p.service_id = s.id AND (p.branch_id = $2 OR p.branch_id IS NULL) AND p.valid_during @> $4::timestamptz
          ORDER BY p.branch_id NULLS LAST LIMIT 1) pv ON true
       LEFT JOIN tax_category tc ON tc.id = pv.tax_category_id
      WHERE s.id = $1 AND s.organization_id = $3 AND s.status = 'ACTIVE'`,
    [serviceId, branchId, orgId, at],
    db,
  );
}
