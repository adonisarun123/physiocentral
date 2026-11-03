import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Database access. node-postgres over TCP to Neon's *pooled* endpoint
 * (PgBouncer, transaction mode). Interactive transactions with row locks
 * (SELECT … FOR UPDATE) are required by the booking and billing invariants,
 * which rules out the stateless HTTP driver. Runs in the Node runtime only.
 */

declare global {
  var __physioPool: Pool | undefined;
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function getPool(): Pool {
  if (!globalThis.__physioPool) {
    // During `next build` modules are imported to collect route config; no DB is
    // needed then and no query runs. Anywhere else a missing URL is a hard error.
    const buildPhase = process.env.NEXT_PHASE === "phase-production-build";
    globalThis.__physioPool = new Pool({
      connectionString: buildPhase ? process.env.DATABASE_URL : databaseUrl(),
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 15_000,
    });
    globalThis.__physioPool.on("error", (err) => {
      console.error("[db] idle client error", err.message);
    });
  }
  return globalThis.__physioPool;
}

export type Db = Pick<PoolClient, "query">;

export async function q<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  db: Db = getPool(),
): Promise<T[]> {
  const res = await db.query<T>(sql, params);
  return res.rows;
}

export async function q1<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  db: Db = getPool(),
): Promise<T | undefined> {
  const rows = await q<T>(sql, params, db);
  return rows[0];
}

const RETRYABLE = new Set(["40001", "40P01"]); // serialization_failure, deadlock_detected

/**
 * Run fn in a transaction. Retries serialization/deadlock failures with a
 * bounded policy (§18.3). Never call external providers inside fn.
 */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      lastErr = err;
      const code = (err as { code?: string }).code;
      if (!code || !RETRYABLE.has(code) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 25 * (i + 1) + Math.random() * 25));
    } finally {
      client.release();
    }
  }
  throw lastErr;
}

export function pgErrorCode(err: unknown): string | undefined {
  return (err as { code?: string })?.code;
}
export function pgConstraint(err: unknown): string | undefined {
  return (err as { constraint?: string })?.constraint;
}
