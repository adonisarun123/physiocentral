/**
 * Editorial internal-link map: the single source of truth for contextual
 * internal links and the structured-data relationships that describe them.
 *
 * Pages render their visible links from these records, then build `relatedLink`
 * / `isRelatedTo` from the links they actually rendered, so markup can never
 * drift ahead of what a reader sees. Navigation, footer and booking CTAs are
 * not listed here: they are site chrome, not editorial relationships.
 *
 * Rules (see docs/internal-linking.md):
 *  - Add a record only when the destination is a real next step for the reader
 *    of the source page. No quotas; an empty list is a valid answer.
 *  - `why` is the editorial rationale and must be supported by the visible copy
 *    of both pages.
 *  - Set `approved: false` to pull a link (and its schema) without deleting the
 *    record. Remove records when a page is retired or a service is withdrawn.
 *  - `isSimilarTo` and `significantLink` are deliberately unused: the services
 *    are not interchangeable alternatives, and there is no click data yet to
 *    call any link significant.
 */

/** Clinical sign-off on the relationships below: Dr Nitin N Sunku, relayed by Arun Mahendran on this date. */
export const LINK_MAP_REVIEWED = "2026-11-12";
export const LINK_MAP_APPROVED_BY = "Dr Nitin N Sunku";

export interface LinkRecord {
  /** Root-relative canonical path of the destination. */
  to: string;
  /** Visible anchor text. Optional where the page uses the live service name or post title. */
  anchor?: string;
  why: string;
  approved: boolean;
}

export interface ServiceRelation {
  /** Slug of the related service. */
  target: string;
  why: string;
  approved: boolean;
}

const svc = (slug: string) => `/services/${slug}`;
const post = (slug: string) => `/blog/${slug}`;

/**
 * Service → related services. Drives the "Related services" cards and the
 * Service entity's `isRelatedTo`. Each relation is grounded in the published
 * "Common reasons people come" lists of the two services.
 */
export const SERVICE_RELATIONS: Record<string, ServiceRelation[]> = {
  "initial-physiotherapy-assessment": [
    { target: "orthopaedic-physiotherapy", why: "Joint pain and stiffness found at assessment are usually treated here next.", approved: true },
    { target: "spine-and-posture-care", why: "Neck and back pain found at assessment are usually treated here next.", approved: true },
    { target: "post-surgical-rehabilitation", why: "The assessment lists 'before or after surgery' as a reason to come.", approved: true },
  ],
  "orthopaedic-physiotherapy": [
    { target: "pain-management-and-manual-therapy", why: "Both cover joint pain and stiffness; hands-on care supports joint treatment.", approved: true },
    { target: "strengthening-and-functional-training", why: "Rebuilding strength follows treatment for joint pain or a fracture.", approved: true },
    { target: "post-surgical-rehabilitation", why: "Readers with a joint problem that needed surgery belong on the rehab page.", approved: true },
  ],
  "post-surgical-rehabilitation": [
    { target: "home-visits", why: "Home visits list 'early recovery after surgery'.", approved: true },
    { target: "strengthening-and-functional-training", why: "Later-stage rehab is strength and function work.", approved: true },
    { target: "orthopaedic-physiotherapy", why: "Joint pain managed without surgery is covered there.", approved: true },
  ],
  "sports-injury-rehabilitation": [
    { target: "strengthening-and-functional-training", why: "Strengthening lists 'returning to exercise after injury'.", approved: true },
    { target: "post-surgical-rehabilitation", why: "Ligament reconstruction rehab is covered there.", approved: true },
    { target: "pain-management-and-manual-therapy", why: "Covers pain that is limiting exercise or rehab.", approved: true },
  ],
  "spine-and-posture-care": [
    { target: "pain-management-and-manual-therapy", why: "Pain management lists neck and back pain.", approved: true },
    { target: "strengthening-and-functional-training", why: "Strengthening helps keep recurring back pain away.", approved: true },
    { target: "initial-physiotherapy-assessment", why: "New neck or back pain starts with an assessment.", approved: true },
  ],
  "strengthening-and-functional-training": [
    { target: "sports-injury-rehabilitation", why: "Return to sport after an injury is covered there.", approved: true },
    { target: "post-surgical-rehabilitation", why: "Strength work after an operation follows the surgeon's protocol there.", approved: true },
    { target: "home-visits", why: "Both list balance problems and reduced mobility in older adults.", approved: true },
  ],
  "pain-management-and-manual-therapy": [
    { target: "spine-and-posture-care", why: "Neck and back pain have their own service.", approved: true },
    { target: "orthopaedic-physiotherapy", why: "Joint pain and arthritis have their own service.", approved: true },
    { target: "strengthening-and-functional-training", why: "Pain relief is described as part of an active recovery plan.", approved: true },
  ],
  "home-visits": [
    { target: "post-surgical-rehabilitation", why: "Most home visits follow surgery; this explains the rehab itself.", approved: true },
    { target: "strengthening-and-functional-training", why: "Both list balance problems and reduced mobility.", approved: true },
    { target: "pain-management-and-manual-therapy", why: "Home visits list 'pain that makes travel difficult'.", approved: true },
  ],
};

const FEES: LinkRecord = { to: "/pricing", anchor: "Fees and treatment packages", why: "Cost is the next question after reading what a service involves.", approved: true };

/** Source page → contextual links (beyond the service relations above). */
export const LINK_MAP: Record<string, LinkRecord[]> = {
  [svc("initial-physiotherapy-assessment")]: [
    { to: post("lower-back-pain-when-to-see-a-physio"), why: "Explains when a problem is worth an assessment.", approved: true },
    FEES,
  ],
  [svc("orthopaedic-physiotherapy")]: [
    { to: post("frozen-shoulder-stages-and-treatment"), why: "Shoulder pain and stiffness is a listed reason to come; the guide links back here.", approved: true },
    FEES,
  ],
  [svc("post-surgical-rehabilitation")]: [
    { to: post("physiotherapy-after-knee-replacement"), why: "Week-by-week detail for the TKR rehab this page offers.", approved: true },
    { to: post("acl-reconstruction-recovery-timeline"), why: "Phase-by-phase detail for ligament reconstruction rehab; the guide links back here.", approved: true },
    FEES,
  ],
  [svc("sports-injury-rehabilitation")]: [
    { to: post("acl-reconstruction-recovery-timeline"), why: "ACL injury is a listed reason to come.", approved: true },
    FEES,
  ],
  [svc("spine-and-posture-care")]: [
    { to: post("lower-back-pain-when-to-see-a-physio"), why: "Lower back pain is the first listed reason to come; the guide links back here.", approved: true },
    FEES,
  ],
  [svc("strengthening-and-functional-training")]: [FEES],
  [svc("pain-management-and-manual-therapy")]: [
    { to: post("lower-back-pain-when-to-see-a-physio"), why: "The guide describes hands-on care to settle back pain.", approved: true },
    FEES,
  ],
  [svc("home-visits")]: [
    { to: post("physiotherapy-after-knee-replacement"), why: "The guide tells readers home visits are available in the first weeks.", approved: true },
    FEES,
  ],

  // Guides: services the article supports but does not already link in its body.
  [post("acl-reconstruction-recovery-timeline")]: [
    { to: svc("sports-injury-rehabilitation"), anchor: "Sports injury rehabilitation", why: "Return-to-sport phases are delivered under this service.", approved: true },
  ],
  [post("physiotherapy-after-knee-replacement")]: [
    { to: svc("post-surgical-rehabilitation"), anchor: "Post-surgical rehabilitation", why: "The service this guide describes; the body links only to home visits.", approved: true },
  ],
  [post("lower-back-pain-when-to-see-a-physio")]: [
    { to: svc("pain-management-and-manual-therapy"), anchor: "Pain management and manual therapy", why: "The guide mentions hands-on care to settle pain.", approved: true },
  ],
  [post("frozen-shoulder-stages-and-treatment")]: [],

  "/pricing": [
    { to: "/services", anchor: "what each service involves", why: "Price tables name treatments without explaining them.", approved: true },
  ],
};

/** Approved contextual links for a source path. */
export function linksFor(path: string): LinkRecord[] {
  return (LINK_MAP[path] ?? []).filter((l) => l.approved);
}

/** Approved related-service slugs for a service, in editorial order. */
export function relatedServiceSlugs(slug: string): string[] {
  return (SERVICE_RELATIONS[slug] ?? []).filter((r) => r.approved && r.target !== slug).map((r) => r.target);
}

/** Root-relative link targets already present in a markdown body (fragments and queries stripped). */
export function bodyLinkPaths(md: string): string[] {
  return [...new Set([...md.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1].split(/[?#]/)[0]))];
}

/** Paths that describe a content relationship. Booking and policy pages are utility links, not `relatedLink` material. */
export function isContentPath(path: string): boolean {
  return /^\/(services|blog|team)\/[a-z0-9-]+$/.test(path) || path === "/pricing" || path === "/services";
}
