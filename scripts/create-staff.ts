/**
 * Invite-style staff account creation (public sign-up is disabled).
 *
 *   STAFF_PASSWORD='a-long-passphrase' npx tsx scripts/create-staff.ts \
 *     --email owner@clinic.example --name "Owner Name" --role OWNER
 *
 * The password is read from the environment so it never lands in shell history
 * as an argument. The user should enable TOTP MFA at /admin/security on first login.
 */
import { parseArgs } from "node:util";
import { ROLES } from "../src/modules/auth/permissions";

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" }, role: { type: "string", multiple: true } },
  });
  const email = values.email?.toLowerCase().trim();
  const name = values.name?.trim();
  const roles = values.role ?? [];
  const password = process.env.STAFF_PASSWORD;
  if (!email || !name || roles.length === 0) throw new Error("--email, --name and at least one --role are required");
  if (!password || password.length < 12) throw new Error("Set STAFF_PASSWORD (min 12 chars)");
  for (const r of roles) if (!ROLES.includes(r as (typeof ROLES)[number])) throw new Error(`Unknown role ${r}. Valid: ${ROLES.join(", ")}`);

  const { auth } = await import("../src/modules/auth/auth");
  const { getPool } = await import("../src/lib/db");
  const ctx = await auth.$context;
  const pool = getPool();

  const org = (await pool.query(`SELECT id FROM organization ORDER BY created_at LIMIT 1`)).rows[0];
  if (!org) throw new Error("No organization. Run scripts/seed.ts first.");

  let user = await ctx.internalAdapter.findUserByEmail(email).then((r) => r?.user);
  if (!user) {
    user = await ctx.internalAdapter.createUser({ email, name, emailVerified: true }, { method: "admin" });
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await ctx.password.hash(password),
    });
    console.log(`+ auth user ${email}`);
  } else {
    console.log(`= auth user ${email} exists`);
  }

  const staff = (await pool.query(
    `INSERT INTO staff_member (organization_id, auth_user_id, display_name) VALUES ($1,$2,$3)
     ON CONFLICT (auth_user_id) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`,
    [org.id, user.id, name],
  )).rows[0];
  for (const role of roles) {
    await pool.query(
      `INSERT INTO role_grant (organization_id, staff_member_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [org.id, staff.id, role],
    );
  }
  await pool.query(
    `INSERT INTO audit_event (organization_id, actor, action, target_type, target_id, changes) VALUES ($1,'system:create-staff','staff.create','staff_member',$2,$3)`,
    [org.id, staff.id, JSON.stringify({ roles })],
  );
  console.log(`+ staff ${name} roles=[${roles.join(", ")}]`);
  await pool.end();
}

main().catch((e) => {
  console.error("create-staff failed:", e.message);
  process.exit(1);
});
