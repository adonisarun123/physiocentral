/**
 * Loads Physio Central by Dr Nitin Sunku's real configuration (idempotent):
 * verified address, opening hours, the bookable clinician, and service content.
 * Source: owner (Arun) in chat, 2026-11-03; services from clinic signage.
 *
 *   DATABASE_URL=... npx tsx scripts/clinic-setup.ts
 */
import { Client } from "pg";
import { SERVICES } from "./content/services";

const MAP_URL = "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("#1181, 24th Main Rd, behind Maramma temple, Garden Layout, Sector 2, HSR Layout, Bengaluru, Karnataka 560102");

// Mon–Sat, 09:00–13:00 and 16:00–20:00 (Postgres DOW: 0 = Sunday)
const HOURS: [number, string, string][] = [];
for (let d = 1; d <= 6; d++) HOURS.push([d, "09:00", "13:00"], [d, "16:00", "20:00"]);

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query("BEGIN");
  try {
    const org = (await c.query(`SELECT id FROM organization ORDER BY created_at LIMIT 1`)).rows[0];
    if (!org) throw new Error("No organization — run migrate + seed first");

    await c.query(
      `UPDATE organization SET trade_name='Physio Central by Dr Nitin Sunku', phone_e164='+917411174333', identity_verified=true, updated_at=now() WHERE id=$1`,
      [org.id],
    );
    const branch = (await c.query(
      `UPDATE branch SET name='Physio Central, HSR Layout',
              address_line='#1181, 1st Floor, 24th Main Rd, behind Maramma temple, Garden Layout, Sector 2',
              locality='HSR Layout', city='Bengaluru', region='Karnataka', postal_code='560102',
              phone_e164='+917411174333', map_url=$2, address_verified=true, public=true,
              access_notes='First floor. Behind Maramma temple on 24th Main Rd, Garden Layout, Sector 2. Please call if you need help with access.',
              booking_lead_minutes=120, booking_horizon_days=30, slot_step_minutes=15,
              updated_at=now()
        WHERE organization_id=$1 AND slug='main' RETURNING id`,
      [org.id, MAP_URL],
    )).rows[0];
    console.log("= clinic identity, address and phone");

    // Clinician: Dr Nitin Sunku. Public profile stays hidden until credentials are verified (§3.3).
    let th = (await c.query(`SELECT id, resource_id FROM therapist WHERE organization_id=$1 AND slug='dr-nitin-sunku'`, [org.id])).rows[0];
    if (!th) {
      const res = (await c.query(`INSERT INTO resource (organization_id, kind, label) VALUES ($1,'THERAPIST','Dr Nitin Sunku') RETURNING id`, [org.id])).rows[0];
      th = (await c.query(
        `INSERT INTO therapist (organization_id, resource_id, slug, display_name, designation, public, credentials_verified, active)
         VALUES ($1,$2,'dr-nitin-sunku','Dr Nitin Sunku','Lead clinician',false,false,true) RETURNING id, resource_id`,
        [org.id, res.id],
      )).rows[0];
      console.log("+ clinician Dr Nitin Sunku (public profile hidden until credentials verified)");
    }
    await c.query(`INSERT INTO therapist_branch VALUES ($1,$2) ON CONFLICT DO NOTHING`, [th.id, branch.id]);
    await c.query(`DELETE FROM availability_rule WHERE resource_id=$1 AND branch_id=$2`, [th.resource_id, branch.id]);
    for (const [d, s, e] of HOURS) {
      await c.query(`INSERT INTO availability_rule (resource_id, branch_id, weekday, start_local, end_local) VALUES ($1,$2,$3,$4,$5)`, [th.resource_id, branch.id, d, s, e]);
    }
    console.log("= opening hours Mon–Sat 09:00–13:00, 16:00–20:00");

    const CATEGORIES: [string, string, number][] = [
      ["Assessment", "assessment", 0], ["Orthopaedic", "orthopaedic", 1], ["Post-surgical", "post-surgical", 2],
      ["Sports", "sports-rehab", 3], ["Spine & posture", "spine-posture", 4], ["Strength & function", "strength-function", 5],
      ["Pain management", "pain-management", 6], ["Home care", "home-care-visits", 7],
    ];
    for (const [name, slug, ord] of CATEGORIES) {
      await c.query(
        `INSERT INTO service_category (organization_id, name, slug, sort_order) VALUES ($1,$2,$3,$4)
         ON CONFLICT (organization_id, slug) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order`,
        [org.id, name, slug, ord],
      );
    }
    // Retire the generic seed placeholders: the clinic's real catalogue replaces them.
    await c.query(
      `UPDATE service SET status='ARCHIVED', public=false, bookable=false, version=version+1, updated_at=now()
        WHERE organization_id=$1 AND status='DRAFT' AND code NOT LIKE 'PC-%'`,
      [org.id],
    );
    for (const s of SERVICES) {
      const cat = (await c.query(`SELECT id FROM service_category WHERE organization_id=$1 AND slug=$2`, [org.id, s.categorySlug])).rows[0];
      // Free the URL slug if an ARCHIVED placeholder holds it; an active clash is a real conflict and fails.
      await c.query(
        `UPDATE service SET slug = slug || '-archived-' || left(id::text, 8), updated_at = now()
          WHERE organization_id=$1 AND slug=$2 AND code<>$3 AND status='ARCHIVED'`,
        [org.id, s.slug, s.code],
      );
      const row = (await c.query(
        `INSERT INTO service (organization_id, category_id, code, slug, name, status, public, bookable, billing_unit, duration_minutes,
           summary, body, who_it_may_help, what_to_expect, limitations, fee_policy_text, bill_description,
           clinical_reviewer, reviewed_on, headline, conditions, session_steps, faqs, seo_title, seo_description, content_status, sort_order)
         VALUES ($1,$2,$3,$4,$5,'ACTIVE',true,$6,$7,$8,$9,$10,$11,$12,$13,
           'Fee confirmed after your assessment — you approve an itemised estimate before treatment.', $5,
           'Physio Central by Dr Nitin Sunku', DATE '2026-11-03', $14,$15,$16,$17,$18,$19,'IN_REVIEW',$20)
         ON CONFLICT (organization_id, code) DO UPDATE SET
           category_id=EXCLUDED.category_id, slug=EXCLUDED.slug, name=EXCLUDED.name, status='ACTIVE', public=true,
           bookable=EXCLUDED.bookable, billing_unit=EXCLUDED.billing_unit, duration_minutes=EXCLUDED.duration_minutes,
           summary=EXCLUDED.summary, body=EXCLUDED.body, who_it_may_help=EXCLUDED.who_it_may_help,
           what_to_expect=EXCLUDED.what_to_expect, limitations=EXCLUDED.limitations, fee_policy_text=EXCLUDED.fee_policy_text,
           headline=EXCLUDED.headline, conditions=EXCLUDED.conditions, session_steps=EXCLUDED.session_steps, faqs=EXCLUDED.faqs,
           seo_title=EXCLUDED.seo_title, seo_description=EXCLUDED.seo_description, sort_order=EXCLUDED.sort_order,
           version=service.version+1, updated_at=now()
         RETURNING id`,
        [org.id, cat?.id ?? null, s.code, s.slug, s.name, s.bookable, s.billingUnit, s.durationMinutes, s.summary, s.body,
         s.whoItMayHelp, s.whatToExpect, s.limitations, s.headline, s.conditions, JSON.stringify(s.steps), JSON.stringify(s.faqs),
         s.seoTitle, s.seoDescription, s.sortOrder],
      )).rows[0];
      await c.query(`INSERT INTO service_branch VALUES ($1,$2) ON CONFLICT DO NOTHING`, [row.id, branch.id]);
      if (s.bookable) await c.query(`INSERT INTO therapist_skill VALUES ($1,$2) ON CONFLICT DO NOTHING`, [th.id, row.id]);
    }
    console.log(`= ${SERVICES.length} services with detailed content (${SERVICES.filter((s) => s.bookable).length} bookable online)`);

    await c.query(
      `INSERT INTO audit_event (organization_id, actor, action, target_type, target_id, changes)
       VALUES ($1::uuid,'system:clinic-setup','clinic.configure','organization',$1::text,$2)`,
      [org.id, JSON.stringify({ hours: "Mon-Sat 09-13,16-20", clinician: "Dr Nitin Sunku", services: SERVICES.length })],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("clinic-setup failed:", e.message);
  process.exit(1);
});
