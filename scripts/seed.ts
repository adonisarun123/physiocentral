/**
 * Seeds the minimum configuration to run the app — and nothing invented.
 * Per spec §7.2/§24: catalog items are DISABLED DRAFTS with NO PRICES; clinic
 * identity, address and credentials are placeholders flagged unverified until
 * the clinic approves real data in the admin. Idempotent.
 *
 *   DATABASE_URL=... npx tsx scripts/seed.ts
 */
import { Client } from "pg";

const DRAFT_CATALOG: Array<{ cat: string; code: string; name: string; unit: string; minutes: number }> = [
  { cat: "Assessment", code: "ASM-INIT", name: "Initial physiotherapy assessment", unit: "Visit", minutes: 60 },
  { cat: "Assessment", code: "ASM-RE", name: "Reassessment", unit: "Visit", minutes: 45 },
  { cat: "Assessment", code: "ASM-FUNC", name: "Functional assessment", unit: "Visit", minutes: 60 },
  { cat: "General treatment", code: "TRT-FU", name: "Follow-up physiotherapy session", unit: "Session", minutes: 45 },
  { cat: "General treatment", code: "TRT-EX", name: "Supervised exercise session", unit: "Session", minutes: 45 },
  { cat: "Musculoskeletal", code: "MSK-BN", name: "Back or neck rehabilitation", unit: "Session", minutes: 45 },
  { cat: "Musculoskeletal", code: "MSK-JT", name: "Joint rehabilitation", unit: "Session", minutes: 45 },
  { cat: "Post-operative", code: "POP-REHAB", name: "Post-operative rehabilitation pathway", unit: "Session", minutes: 45 },
  { cat: "Sports", code: "SPT-REHAB", name: "Sports rehabilitation", unit: "Session", minutes: 45 },
  { cat: "Sports", code: "SPT-RTA", name: "Return-to-activity assessment", unit: "Assessment", minutes: 60 },
  { cat: "Neurological", code: "NEU-REHAB", name: "Neurological rehabilitation", unit: "Session", minutes: 60 },
  { cat: "Older adults", code: "OA-BAL", name: "Balance and mobility rehabilitation", unit: "Session", minutes: 45 },
  { cat: "Home care", code: "HOME-ASM", name: "Home assessment", unit: "Visit", minutes: 60 },
  { cat: "Materials", code: "MAT-TAPE", name: "Kinesiology tape application (materials)", unit: "Item", minutes: 5 },
  { cat: "Documentation", code: "DOC-RPT", name: "Treatment summary report", unit: "Document", minutes: 5 },
];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query("BEGIN");

  let org = (await c.query(`SELECT id FROM organization ORDER BY created_at LIMIT 1`)).rows[0];
  if (!org) {
    org = (await c.query(
      `INSERT INTO organization (trade_name, legal_name, identity_verified) VALUES ('Physio Central', NULL, false) RETURNING id`,
    )).rows[0];
    console.log("+ organization (identity UNVERIFIED placeholder)");
  }
  let branch = (await c.query(`SELECT id FROM branch WHERE organization_id=$1 AND slug='main'`, [org.id])).rows[0];
  if (!branch) {
    branch = (await c.query(
      `INSERT INTO branch (organization_id, slug, name, public, address_verified) VALUES ($1,'main','Main clinic', true, false) RETURNING id`,
      [org.id],
    )).rows[0];
    console.log("+ branch 'main' (address UNVERIFIED — set real address in admin before launch)");
  }
  for (const label of ["Treatment room 1", "Treatment room 2"]) {
    const exists = (await c.query(`SELECT 1 FROM resource WHERE organization_id=$1 AND label=$2`, [org.id, label])).rowCount;
    if (!exists) await c.query(`INSERT INTO resource (organization_id, kind, label) VALUES ($1,'ROOM',$2)`, [org.id, label]);
  }
  await c.query(
    `INSERT INTO tax_category (organization_id, code, name, rate_bp, exemption_basis, accountant_approved)
     VALUES ($1,'UNCLASSIFIED','Not yet classified by accountant',0,'Pending accountant determination (§9.3)',false)
     ON CONFLICT (organization_id, code) DO NOTHING`,
    [org.id],
  );

  let sort = 0;
  for (const item of DRAFT_CATALOG) {
    const catSlug = slugify(item.cat);
    const cat = (await c.query(
      `INSERT INTO service_category (organization_id, name, slug, sort_order) VALUES ($1,$2,$3,$4)
       ON CONFLICT (organization_id, slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [org.id, item.cat, catSlug, sort++],
    )).rows[0];
    const r = await c.query(
      `INSERT INTO service (organization_id, category_id, code, slug, name, status, public, bookable, billing_unit, duration_minutes,
         fee_policy_text, summary)
       VALUES ($1,$2,$3,$4,$5,'DRAFT',false,false,$6,$7,'Fees are confirmed after assessment. Please ask the clinic.',
               'Draft — awaiting clinic approval of scope, qualifications, duration and price.')
       ON CONFLICT (organization_id, code) DO NOTHING RETURNING id`,
      [org.id, cat.id, item.code, slugify(item.name), item.name, item.unit, item.minutes],
    );
    if (r.rows[0]) await c.query(`INSERT INTO service_branch (service_id, branch_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [r.rows[0].id, branch.id]);
  }
  console.log(`= draft catalog: ${DRAFT_CATALOG.length} items (disabled, no prices)`);
  await c.query("COMMIT");
  await c.end();
}

main().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
