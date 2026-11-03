import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Readiness: checks DB reachability and migration state without revealing secrets (§21.2). */
export async function GET() {
  const started = Date.now();
  try {
    const r = await getPool().query<{ migrations: string; now: Date; version: string }>(
      `SELECT (SELECT count(*) FROM schema_migrations)::text AS migrations, now() AS now, current_setting('server_version') AS version`,
    );
    return NextResponse.json(
      { status: "ok", db: { reachable: true, migrations: Number(r.rows[0].migrations), serverVersion: r.rows[0].version, latencyMs: Date.now() - started } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ status: "degraded", db: { reachable: false } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
