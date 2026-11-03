/**
 * End-to-end smoke test over HTTP against a RUNNING app and a DISPOSABLE
 * database (e.g. a Neon test branch). It resets the schema, runs the real
 * migrations, loads a synthetic fixture, then exercises the public site, the
 * booking API, the secure patient link, staff auth and the accept endpoint.
 *
 *   ALLOW_DB_RESET=1 DATABASE_URL=<test-branch-url> BASE_URL=http://localhost:3000 npx tsx scripts/smoke.ts
 *
 * Never point this at production: it drops the public schema.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const results: { name: string; ok: boolean; detail?: string }[] = [];

async function check(name: string, fn: () => Promise<string | void>) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || undefined });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    results.push({ name, ok: false, detail: (e as Error).message });
    console.log(`  ✗ ${name} — ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  if (process.env.ALLOW_DB_RESET !== "1") throw new Error("Set ALLOW_DB_RESET=1 (disposable database only)");
  const { resetDatabase, buildFixture, futureSlot } = await import("../tests/integration/helpers");
  const { getPool } = await import("../src/lib/db");

  console.log("Setup: reset schema → migrations → fixture");
  await resetDatabase(false);
  execFileSync("npx", ["tsx", "scripts/migrate.ts"], { stdio: "inherit", env: process.env });
  const f = await buildFixture();
  const password = `smoke-${randomUUID()}`;
  execFileSync("npx", ["tsx", "scripts/create-staff.ts", "--email", "smoke.owner@example.test", "--name", "Smoke Owner", "--role", "OWNER"], {
    stdio: "inherit", env: { ...process.env, STAFF_PASSWORD: password },
  });
  const db = getPool();
  await db.query(`UPDATE branch SET phone_e164='+919800000000' WHERE id=$1`, [f.branchA]);
  const startsAt = await futureSlot(f, f.branchA, f.therapist1, 3);

  console.log(`\nHTTP checks against ${BASE}`);
  await check("health endpoint reports DB reachable + migrations", async () => {
    const r = await fetch(`${BASE}/api/health`);
    const j = await r.json();
    assert(r.status === 200 && j.db.reachable && j.db.migrations >= 1, `status ${r.status} ${JSON.stringify(j)}`);
    return `pg ${j.db.serverVersion}, ${j.db.latencyMs} ms`;
  });

  await check("home page renders server-side with DB content", async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    assert(html.includes("Test Clinic") && html.includes("SESSION"), "clinic/service not in HTML");
  });

  await check("service page 200; unknown service is a real 404", async () => {
    const ok = await fetch(`${BASE}/services/session`);
    const missing = await fetch(`${BASE}/services/does-not-exist`);
    assert(ok.status === 200 && missing.status === 404, `got ${ok.status} / ${missing.status}`);
  });

  await check("public services API hides drafts and internals", async () => {
    const j = await (await fetch(`${BASE}/api/v1/public/services`)).json();
    assert(Array.isArray(j.data) && j.data.length === 2, `expected 2 services, got ${j.data?.length}`);
    assert(!JSON.stringify(j).includes("internal_guidance"), "internal field leaked");
  });

  let slotCount = 0;
  await check("availability API returns live slots", async () => {
    const date = new Date(startsAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const r = await fetch(`${BASE}/api/v1/public/availability?branchId=${f.branchA}&serviceId=${f.sessionSvc}&therapistId=${f.therapist1}&date=${date}`);
    const j = await r.json();
    slotCount = j.data?.slots?.length ?? 0;
    assert(r.status === 200 && slotCount > 0, `status ${r.status}`);
    assert(j.data.slots.some((s: { startsAt: string }) => s.startsAt === startsAt), "target slot missing");
    return `${slotCount} slots`;
  });

  const key = randomUUID();
  const body = {
    branchId: f.branchA, serviceId: f.sessionSvc, therapistId: f.therapist1, startsAt,
    fullName: "Smoke Patient", phone: "+91 98111 22233", email: "", isNewPatient: "yes", privacyAck: true, marketingOptIn: false,
  };
  let reference = "", manageToken = "";
  await check("POST booking request → 201 REQUESTED with reference + secure link", async () => {
    const r = await fetch(`${BASE}/api/v1/booking-requests`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });
    const j = await r.json();
    assert(r.status === 201 && j.data.status === "REQUESTED", `status ${r.status} ${JSON.stringify(j)}`);
    reference = j.data.reference;
    manageToken = j.data.manageToken;
    return reference;
  });

  await check("idempotent replay returns the same reference; altered payload → 409", async () => {
    const r = await fetch(`${BASE}/api/v1/booking-requests`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });
    const j = await r.json();
    assert(j.data.reference === reference && j.data.replayed === true, "replay mismatch");
    const c = await fetch(`${BASE}/api/v1/booking-requests`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify({ ...body, fullName: "Changed" }) });
    assert(c.status === 409, `expected 409, got ${c.status}`);
  });

  await check("secure manage link shows status; private + noindex headers", async () => {
    const r = await fetch(`${BASE}/manage/${manageToken}`);
    const html = await r.text();
    assert(r.status === 200 && html.includes(reference) && html.includes("pending clinic confirmation"), "manage page content");
    assert((r.headers.get("cache-control") ?? "").includes("no-store"), `cache-control: ${r.headers.get("cache-control")}`);
    assert((r.headers.get("x-robots-tag") ?? "").includes("noindex"), "missing noindex");
    const bad = await (await fetch(`${BASE}/manage/${"x".repeat(43)}`)).text();
    assert(bad.includes("not valid"), "invalid token accepted");
  });

  await check("admin requires auth (redirects to login)", async () => {
    const r = await fetch(`${BASE}/admin`, { redirect: "manual" });
    assert([303, 307, 308].includes(r.status) && (r.headers.get("location") ?? "").includes("/admin/login"), `status ${r.status}`);
  });

  let cookie = "";
  await check("staff sign-in (Better Auth, DB session cookie)", async () => {
    const r = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST", headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email: "smoke.owner@example.test", password }),
    });
    const set = r.headers.getSetCookie?.() ?? [];
    cookie = set.map((c) => c.split(";")[0]).join("; ");
    assert(r.status === 200 && cookie.includes("session_token"), `status ${r.status} ${await r.text()}`);
    const flags = set.find((c) => c.includes("session_token")) ?? "";
    assert(/HttpOnly/i.test(flags), "session cookie not HttpOnly");
  });

  await check("wrong password is refused", async () => {
    const r = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email: "smoke.owner@example.test", password: "wrong-password-123" }) });
    assert(r.status === 401 || r.status === 400, `status ${r.status}`);
  });

  const appt = (await db.query(`SELECT id, version FROM appointment WHERE public_ref=$1`, [reference])).rows[0];
  await check("request appears in the staff inbox", async () => {
    const r = await fetch(`${BASE}/admin/requests`, { headers: { cookie } });
    const html = await r.text();
    assert(r.status === 200 && html.includes("Smoke Patient") && html.includes(reference), `status ${r.status}`);
  });

  await check("accept API without same-origin header is refused (CSRF)", async () => {
    const r = await fetch(`${BASE}/api/v1/appointments/${appt.id}/accept`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: appt.version }) });
    assert(r.status === 403, `status ${r.status}`);
  });

  await check("accept API confirms atomically (spec §19.3 contract)", async () => {
    const r = await fetch(`${BASE}/api/v1/appointments/${appt.id}/accept`, {
      method: "POST", headers: { cookie, origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: appt.version }),
    });
    const j = await r.json();
    assert(r.status === 200 && j.data.status === "CONFIRMED" && j.data.version === appt.version + 1, `status ${r.status} ${JSON.stringify(j)}`);
    const res = await db.query(`SELECT count(*)::int n FROM resource_reservation WHERE appointment_id=$1 AND state='CONFIRMED'`, [appt.id]);
    assert(res.rows[0].n === 1, "reservation not created");
  });

  await check("stale re-accept → 409; slot gone from public availability", async () => {
    const r = await fetch(`${BASE}/api/v1/appointments/${appt.id}/accept`, {
      method: "POST", headers: { cookie, origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: appt.version }),
    });
    assert(r.status === 409, `status ${r.status}`);
    const date = new Date(startsAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const j = await (await fetch(`${BASE}/api/v1/public/availability?branchId=${f.branchA}&serviceId=${f.sessionSvc}&therapistId=${f.therapist1}&date=${date}`)).json();
    assert(!j.data.slots.some((s: { startsAt: string }) => s.startsAt === startsAt), "confirmed slot still offered");
  });

  await check("admin pages render for the signed-in owner", async () => {
    for (const p of ["/admin", `/admin/appointments/${appt.id}`, "/admin/calendar", "/admin/catalog", "/admin/invoices", "/admin/payments"]) {
      const r = await fetch(`${BASE}${p}`, { headers: { cookie } });
      assert(r.status === 200, `${p} → ${r.status}`);
      assert((r.headers.get("cache-control") ?? "").includes("no-store"), `${p} cacheable`);
    }
  });

  await check("sitemap lists public pages only", async () => {
    const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
    assert(xml.includes("/services/session") && !xml.includes("/admin") && !xml.includes("/book") && !xml.includes("/manage"), "sitemap content");
  });

  await check("security headers present", async () => {
    const r = await fetch(`${BASE}/`);
    for (const h of ["content-security-policy", "x-content-type-options", "referrer-policy", "x-frame-options"]) assert(r.headers.get(h), `missing ${h}`);
    assert(!r.headers.get("x-powered-by"), "x-powered-by exposed");
  });

  await check("payment webhook is disabled (no unverified money path)", async () => {
    const r = await fetch(`${BASE}/api/webhooks/payments/provider`, { method: "POST", body: "{}" });
    assert(r.status === 501, `status ${r.status}`);
  });

  await db.end();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("Smoke setup failed:", e.message);
  process.exit(1);
});
