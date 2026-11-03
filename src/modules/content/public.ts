import { q, q1 } from "@/lib/db";

/**
 * Public DTOs (§17.2): only approved, public fields. No internal guidance,
 * no draft/archived services, no unapproved prices, no patient data.
 */
export interface PublicClinic {
  tradeName: string;
  legalName: string | null;
  identityVerified: boolean;
  phone: string | null;
  email: string | null;
}

export async function getPublicClinic(): Promise<PublicClinic | null> {
  const r = await q1<{ trade_name: string; legal_name: string | null; identity_verified: boolean; phone_e164: string | null; email: string | null }>(
    `SELECT trade_name, legal_name, identity_verified, phone_e164, email FROM organization ORDER BY created_at LIMIT 1`,
  );
  return r ? { tradeName: r.trade_name, legalName: r.legal_name, identityVerified: r.identity_verified, phone: r.phone_e164, email: r.email } : null;
}

export interface PublicBranch {
  id: string; slug: string; name: string; timezone: string;
  addressLine: string | null; locality: string | null; city: string | null; region: string | null; postalCode: string | null;
  phone: string | null; mapUrl: string | null; accessNotes: string | null; addressVerified: boolean;
  latitude: string | null; longitude: string | null; responseWindow: string;
}

export async function getPublicBranches(): Promise<PublicBranch[]> {
  const rows = await q<Record<string, unknown>>(
    `SELECT id, slug, name, timezone, address_line, locality, city, region, postal_code, phone_e164, map_url, access_notes,
            address_verified, latitude::text, longitude::text, response_window_text
       FROM branch WHERE public ORDER BY name`,
  );
  return rows.map((r) => ({
    id: r.id as string, slug: r.slug as string, name: r.name as string, timezone: r.timezone as string,
    addressLine: r.address_line as string | null, locality: r.locality as string | null, city: r.city as string | null,
    region: r.region as string | null, postalCode: r.postal_code as string | null, phone: r.phone_e164 as string | null,
    mapUrl: r.map_url as string | null, accessNotes: r.access_notes as string | null, addressVerified: r.address_verified as boolean,
    latitude: r.latitude as string | null, longitude: r.longitude as string | null, responseWindow: r.response_window_text as string,
  }));
}

export async function getOpeningHours(branchId: string) {
  return q<{ weekday: number; opens: string; closes: string }>(
    `SELECT DISTINCT weekday, to_char(start_local,'HH24:MI') AS opens, to_char(end_local,'HH24:MI') AS closes
       FROM availability_rule WHERE branch_id=$1 ORDER BY weekday, opens`,
    [branchId],
  );
}

export interface PublicService {
  id: string; slug: string; code: string; name: string; category: string | null; summary: string | null; body: string | null;
  whoItMayHelp: string | null; whatToExpect: string | null; limitations: string | null; durationMinutes: number;
  billingUnit: string; feePolicyText: string | null; clinicalReviewer: string | null; reviewedOn: string | null;
  bookable: boolean; pricePaise: string | null;
  headline: string | null; conditions: string[]; steps: { title: string; body: string }[]; faqs: { q: string; a: string }[];
  seoTitle: string | null; seoDescription: string | null;
}

const SERVICE_SELECT = `
  SELECT s.id, s.slug, s.code, s.name, c.name AS category, s.summary, s.body, s.who_it_may_help, s.what_to_expect, s.limitations,
         s.duration_minutes, s.billing_unit, s.fee_policy_text, s.clinical_reviewer, to_char(s.reviewed_on,'YYYY-MM-DD') AS reviewed_on,
         s.bookable, pv.unit_price_paise, s.headline, s.conditions, s.session_steps, s.faqs, s.seo_title, s.seo_description, s.sort_order
    FROM service s
    LEFT JOIN service_category c ON c.id = s.category_id
    LEFT JOIN LATERAL (SELECT unit_price_paise FROM service_price_version p
                        WHERE p.service_id = s.id AND p.branch_id IS NULL AND p.valid_during @> now() LIMIT 1) pv ON true
   WHERE s.status = 'ACTIVE' AND s.public`;

function mapService(r: Record<string, unknown>): PublicService {
  return {
    id: r.id as string, slug: r.slug as string, code: r.code as string, name: r.name as string, category: r.category as string | null,
    summary: r.summary as string | null, body: r.body as string | null, whoItMayHelp: r.who_it_may_help as string | null,
    whatToExpect: r.what_to_expect as string | null, limitations: r.limitations as string | null,
    durationMinutes: r.duration_minutes as number, billingUnit: r.billing_unit as string, feePolicyText: r.fee_policy_text as string | null,
    clinicalReviewer: r.clinical_reviewer as string | null, reviewedOn: r.reviewed_on as string | null, bookable: r.bookable as boolean,
    pricePaise: (r.unit_price_paise as string | null) ?? null,
    headline: (r.headline as string | null) ?? null,
    conditions: (r.conditions as string[] | null) ?? [],
    steps: (r.session_steps as { title: string; body: string }[] | null) ?? [],
    faqs: (r.faqs as { q: string; a: string }[] | null) ?? [],
    seoTitle: (r.seo_title as string | null) ?? null,
    seoDescription: (r.seo_description as string | null) ?? null,
  };
}

export async function getPublicServices(): Promise<PublicService[]> {
  const rows = await q<Record<string, unknown>>(`${SERVICE_SELECT} ORDER BY s.sort_order, c.sort_order NULLS LAST, s.name`);
  return rows.map(mapService);
}

export async function getPublicService(slug: string): Promise<PublicService | null> {
  const r = await q1<Record<string, unknown>>(`${SERVICE_SELECT} AND s.slug = $1`, [slug]);
  return r ? mapService(r) : null;
}

export interface PublicTherapist {
  id: string; slug: string; displayName: string; designation: string; bio: string | null; languages: string[];
}

export async function getPublicTherapists(): Promise<PublicTherapist[]> {
  const rows = await q<{ id: string; slug: string; display_name: string; designation: string; bio: string | null; languages: string[] }>(
    `SELECT id, slug, display_name, designation, bio, languages FROM therapist
      WHERE public AND active AND credentials_verified ORDER BY display_name`,
  );
  return rows.map((r) => ({ id: r.id, slug: r.slug, displayName: r.display_name, designation: r.designation, bio: r.bio, languages: r.languages }));
}

export async function getPublicTherapist(slug: string): Promise<PublicTherapist | null> {
  return (await getPublicTherapists()).find((t) => t.slug === slug) ?? null;
}

/** Therapists eligible for a service at a branch, for the booking picker. */
export async function getBookableTherapists(serviceId: string, branchId: string) {
  return q<{ id: string; display_name: string; designation: string }>(
    `SELECT t.id, t.display_name, t.designation FROM therapist t
       JOIN therapist_branch tb ON tb.therapist_id=t.id AND tb.branch_id=$2
       JOIN therapist_skill ts ON ts.therapist_id=t.id AND ts.service_id=$1
      WHERE t.active AND t.public ORDER BY t.display_name`,
    [serviceId, branchId],
  );
}
