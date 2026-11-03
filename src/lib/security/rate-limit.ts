import { q1, type Db, getPool } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { hashToken } from "./tokens";

/**
 * Fixed-window limiter in Postgres so limits hold across instances (SEC-09).
 * Keys are hashed so contact details never sit in the table in clear text.
 */
export async function rateLimit(rawKey: string, limit: number, windowSeconds: number, db: Db = getPool()) {
  const key = hashToken(rawKey);
  const row = await q1<{ hits: number }>(
    `INSERT INTO rate_limit_bucket (bucket_key, window_start, hits)
     VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2) * $2), 1)
     ON CONFLICT (bucket_key, window_start) DO UPDATE SET hits = rate_limit_bucket.hits + 1
     RETURNING hits`,
    [key, windowSeconds],
    db,
  );
  if ((row?.hits ?? 0) > limit) {
    throw new DomainError("RATE_LIMITED", "Too many attempts. Please wait a little and try again, or call the clinic.");
  }
}
