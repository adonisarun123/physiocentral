import { q1, getPool } from "@/lib/db";
import { hashToken } from "@/lib/security/tokens";
import type { PatientLinkActor } from "@/modules/auth/actor";

/**
 * Resolve a secure management link (AUTH-06). Only the hash is stored; the
 * token is bound to one appointment, expires, and can be revoked.
 */
export async function resolveManageToken(token: string): Promise<PatientLinkActor | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const row = await q1<{ appointment_id: string; id: string }>(
    `UPDATE manage_token SET last_used_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
      RETURNING id, appointment_id`,
    [hashToken(token)],
    getPool(),
  );
  if (!row) return null;
  return { kind: "patient_link", appointmentId: row.appointment_id, label: `patient_link:${row.id}` };
}
