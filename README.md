# Physio Central — clinic web app

Next.js 16.4 (App Router, TypeScript strict) + PostgreSQL on Neon. Built against
*Physiotherapy Web App — Next.js Implementation Specification v1.0 (3 Nov 2026)*.

**Status: the spec's §23.2 vertical slice, backed by the database. It is not the full
spec and not production-complete.** The spec estimates 10–14 weeks for two developers.

## What works (database-enforced, tested)

| Area | What's built | Where the invariant lives |
|---|---|---|
| Public site | Home, services, service detail, team, location, contact, about, policy drafts; SSR; metadata; JSON-LD (only when clinic identity + address are verified); sitemap allowlist; robots; real 404s | `src/app/(public)`, `src/modules/content` |
| Booking | 4-step accessible stepper, live availability in branch timezone, honeypot, DB rate limits, idempotent requests (BOOK-04), "pending clinic confirmation" wording, hashed secure manage link | `appointment`, `idempotency_record`, `manage_token` |
| Scheduling | Request inbox, accept / reject, check-in → start → complete, no-show threshold, cancel (releases capacity), optimistic version checks, `PROPOSAL_REQUIRED` on material changes | **`EXCLUDE USING gist` on `resource_reservation`**; global therapist resource across branches |
| Catalog | Draft seed catalog (no prices), effective-dated price versions, publish requires a clinical reviewer | `EXCLUDE` on price periods; `CHECK` on public+active |
| Estimates | Draft → freeze/send (content hash) → patient accepts via link or staff records offline with attestation → revise = new version; accepted ≠ performed | triggers freeze sent versions; unique approval per version |
| Invoices | Draft from billable charges, issue with FY numbering inside the transaction, immutable snapshot, print view | **unique `invoice_line(billable_charge_id)`**; issued-invoice trigger; sequence row lock |
| Payments | Record (cash / manual UPI / bank), separate verifier role, receipts, allocation ledger, derived UNPAID / PARTIAL / PAID, overpayment stays unallocated credit | append-only `payment_allocation`, `payment` guard trigger, `invoice_balance` view |
| Auth | Better Auth: staff email + password, DB sessions (HttpOnly, revocable, 12 h), TOTP MFA, invite-only accounts, role presets → permissions, server-side checks in every action | `src/modules/auth` |
| Ops | Audit log (append-only trigger), transactional outbox, `/api/health`, security headers, `no-store` on private routes | |

## Not built (stubbed honestly, not faked)

Gateway payments (the webhook returns 501), credit notes and refunds, proposals the patient can accept, rescheduling, deposits and holds, packages, home visits, intake and clinical notes, the CMS workflow, reports and exports, the PDF worker and notification delivery (events queue in `outbox_event`, but no worker sends them), OTP verification for patients, the leave/closure impact workflow, guardians, privacy-request queue.

## Deviations from the spec

- **Raw SQL + `pg` instead of Prisma.** The core invariants (tstzrange exclusion, triggers, row locks, views) are SQL anyway. Migrations live in `db/migrations/*.sql` and are checksummed.
- **Cache Components off, all DB pages dynamic.** This is simpler and safe for private data. Tag-based caching of public pages should come once the CMS exists.
- **Session inactivity timeout (30 min) is not enforced.** Only the 12 h absolute lifetime is.
- **Staff MFA is prompted, not forced.** Every admin page shows a banner until TOTP is enabled.

## Running locally

```bash
npm install
npm run db:local                         # embedded Postgres on :54329 (dev only)
cp .env.example .env.local               # set DATABASE_URL etc.
npm run db:migrate && npm run db:seed
STAFF_PASSWORD='long-passphrase' npm run staff:create -- --email you@clinic.in --name "You" --role OWNER
npm run dev
```

## Tests

```bash
npm run test:unit                                    # money arithmetic
ALLOW_DB_RESET=1 DATABASE_URL=<disposable db> npm run test:integration
ALLOW_DB_RESET=1 DATABASE_URL=<disposable db> BASE_URL=http://localhost:3000 npm run smoke   # app must be running
```

Integration tests run against **real Postgres**. They cover UAT-01–05, 11–16, 21–23, 34 and 35, plus concurrent accept, concurrent invoice issue, and concurrent double-billing races. Both suites drop the `public` schema, so never point them at production.

## Before launch (§24 owner decisions)

Clinic legal identity and address, verified therapist profiles, approved service scope and prices, accountant-approved tax categories (taxed lines are blocked until then), policy text, booking rules, notification provider, and a backup/restore drill.
