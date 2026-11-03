/**
 * Applies versioned SQL migrations (db/migrations/*.sql) in order, each in its
 * own transaction, recorded in schema_migrations with a checksum. Then applies
 * Better Auth's table migrations. Safe to re-run.
 *
 *   DATABASE_URL=... npx tsx scripts/migrate.ts
 *
 * Use the DIRECT (non-pooled) Neon URL for DDL if DATABASE_URL_UNPOOLED is set.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);

  const dir = path.join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = readFileSync(path.join(dir, f), "utf8");
    const sum = createHash("sha256").update(sql).digest("hex");
    const done = await client.query(`SELECT checksum FROM schema_migrations WHERE filename=$1`, [f]);
    if (done.rows[0]) {
      if (done.rows[0].checksum !== sum) throw new Error(`Migration ${f} was modified after being applied. Add a new migration instead.`);
      console.log(`= ${f} (already applied)`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (filename, checksum) VALUES ($1,$2)`, [f, sum]);
      await client.query("COMMIT");
      console.log(`+ ${f}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
  await client.end();

  // Better Auth tables (user, session, account, verification, twoFactor, rateLimit).
  const { getMigrations } = await import("better-auth/db/migration");
  const { auth } = await import("../src/modules/auth/auth");
  const m = await getMigrations(auth.options);
  if (m.toBeCreated.length || m.toBeAdded.length || m.toBeAddedIndexes.length) {
    await m.runMigrations();
    console.log(`+ better-auth: created [${m.toBeCreated.map((t) => t.table).join(", ")}] added [${m.toBeAdded.map((t) => t.table).join(", ")}]`);
  } else {
    console.log("= better-auth schema up to date");
  }
  const { getPool } = await import("../src/lib/db");
  await getPool().end();
}

main().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
