# Internal linking and relationship schema

Implements the "Generic Internal Linking and Structured Data Implementation Guide" (v1.0, 12 Nov 2026) for physiocentral.in.

## How it works

`src/content/link-map.ts` is the single source of truth. Pages render visible `<a href>` links from it, then build structured data from the links they actually rendered, so markup never claims a link a reader cannot see.

| Template | Visible links added | Structured data |
|---|---|---|
| Service (`/services/[slug]`) | 3 editorially chosen related services (was: the first 3 by sort order), related patient guides, fees, and the physiotherapist who provides it | `relatedLink` on the existing `MedicalWebPage` (`#page`); `isRelatedTo` on the existing `Service` (`#service`) |
| Guide (`/blog/[slug]`) | "Related care" block for services the article supports but does not already link in its body | New `WebPage` (`#page`) with `relatedLink`; `BlogPosting` now points to it via `mainEntityOfPage` |
| Team profile (`/team/[slug]`) | Services the physiotherapist provides (from `therapist_skill`, the rows that drive booking), link back to the team | New `WebPage` (`#page`) with `relatedLink`; existing `Person` gets `@id` `#person` |
| Pricing | Link to the services index | None |

Not used, on purpose: `significantLink` (no click data yet) and `isSimilarTo` (the services are not interchangeable, and it must never be applied to clinicians).

## Changing links

- Add, edit or remove records in `link-map.ts`. Every record needs a `why` that the visible copy of both pages supports.
- `approved: false` pulls one link and its schema without deleting the record.
- Service destinations are checked against live public services at render time, so archiving a service removes its links automatically. `npm run test:unit` fails on a destination that is not a real service, guide or page, on duplicates, and on self-links.
- Clinical wording and service relationships are the clinical lead's call. Have Dr Sunku review the map when services or guides change.

## Rollback

Set `RELATIONSHIP_SCHEMA=off` in the environment and redeploy: `relatedLink` and `isRelatedTo` disappear, visible links stay.

## QA after each deploy

1. Run two or three URLs per template through https://validator.schema.org/ and Search Console URL Inspection.
2. Confirm each `relatedLink` URL appears as a visible link on the page and returns 200 with a self-referencing canonical.

## Measurement

Google does not promise that these properties affect rankings. Treat the visible links as the change that matters (link clicks, bookings from guides) and record the deploy date. With 14 pages there is no sample for a holdout test, so any before/after reading is observational.
