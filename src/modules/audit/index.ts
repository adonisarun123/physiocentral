import type { Db } from "@/lib/db";

/** Append an audit event in the caller's transaction (AUTH-07, SEC-11). Keep changes free of clinical narrative. */
export async function audit(
  db: Db,
  e: {
    organizationId?: string | null;
    actor: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    changes?: Record<string, unknown>;
    reason?: string | null;
    correlationId?: string | null;
  },
) {
  await db.query(
    `INSERT INTO audit_event (organization_id, actor, action, target_type, target_id, changes, reason, correlation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      e.organizationId ?? null,
      e.actor,
      e.action,
      e.targetType,
      e.targetId ?? null,
      e.changes ? JSON.stringify(e.changes, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) : null,
      e.reason ?? null,
      e.correlationId ?? null,
    ],
  );
}

/** Transactional outbox (§20.1). Payload must hold safe references only. */
export async function enqueue(db: Db, topic: string, dedupeKey: string, payload: Record<string, unknown>) {
  await db.query(
    `INSERT INTO outbox_event (topic, dedupe_key, payload) VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
    [topic, dedupeKey, JSON.stringify(payload)],
  );
}
