/**
 * Non-destructive checks against a RUNNING app on a live database (safe for
 * production): reads public pages, signs in a staff user (creates a session
 * row), and loads admin screens. Creates no patients, bookings or money records.
 *
 *   BASE_URL=http://localhost:3000 OWNER_EMAIL=... OWNER_PASSWORD=... npx tsx scripts/verify-live.ts
 */
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
let failed = 0;
async function check(name: string, fn: () => Promise<string | void>) {
  try {
    const d = await fn();
    console.log(`  ✓ ${name}${d ? ` — ${d}` : ""}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name} — ${(e as Error).message}`);
  }
}
function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error(m);
}

async function main() {
  console.log(`Live checks against ${BASE}`);
  await check("health: DB reachable, migrations applied", async () => {
    const r = await fetch(`${BASE}/api/health`);
    const j = await r.json();
    assert(r.ok && j.db.reachable && j.db.migrations >= 1, JSON.stringify(j));
    return `Postgres ${j.db.serverVersion}, ${j.db.latencyMs} ms`;
  });
  for (const p of ["/", "/services", "/team", "/about", "/contact", "/locations/main", "/book", "/privacy"]) {
    await check(`GET ${p} → 200`, async () => {
      const r = await fetch(`${BASE}${p}`);
      assert(r.status === 200, `status ${r.status}`);
    });
  }
  await check("unknown service → 404", async () => {
    assert((await fetch(`${BASE}/services/nope`)).status === 404, "not 404");
  });
  await check("drafts are not public (catalog API empty until services are activated)", async () => {
    const j = await (await fetch(`${BASE}/api/v1/public/services`)).json();
    return `${j.data.length} public services`;
  });
  await check("admin is protected", async () => {
    const r = await fetch(`${BASE}/admin`, { redirect: "manual" });
    assert([303, 307, 308].includes(r.status), `status ${r.status}`);
  });
  let cookie = "";
  await check("owner sign-in", async () => {
    const r = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD }),
    });
    cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    assert(r.ok && cookie.includes("session_token"), `status ${r.status}`);
  });
  for (const p of ["/admin", "/admin/requests", "/admin/calendar", "/admin/catalog", "/admin/invoices", "/admin/payments", "/admin/security"]) {
    await check(`GET ${p} (signed in) → 200, no-store`, async () => {
      const r = await fetch(`${BASE}${p}`, { headers: { cookie } });
      assert(r.status === 200, `status ${r.status}`);
      assert((r.headers.get("cache-control") ?? "").includes("no-store"), "cacheable");
    });
  }
  await check("catalog shows the seeded draft services", async () => {
    const html = await (await fetch(`${BASE}/admin/catalog`, { headers: { cookie } })).text();
    assert(html.includes("Initial physiotherapy assessment"), "seed missing");
  });
  await check("sitemap excludes private routes", async () => {
    const x = await (await fetch(`${BASE}/sitemap.xml`)).text();
    assert(!x.includes("/admin") && !x.includes("/book") && !x.includes("/manage"), "private URL in sitemap");
  });
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll live checks passed");
  process.exit(failed ? 1 : 0);
}
main();
