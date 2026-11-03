import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { clientIp, jsonRoute } from "@/lib/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { distinctStarts, findSlots } from "@/modules/scheduling/availability";
import { q1 } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  therapistId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** GET /api/v1/public/availability — eligible slot options; no patient identity (§19.2). */
export async function GET(req: Request) {
  return jsonRoute(async () => {
    await rateLimit(`availability:${await clientIp()}`, 120, 60);
    const u = new URL(req.url);
    const p = schema.safeParse(Object.fromEntries(u.searchParams));
    if (!p.success) throw new DomainError("VALIDATION", "Invalid availability query.");
    const svc = await q1(`SELECT 1 FROM service WHERE id=$1 AND status='ACTIVE' AND public AND bookable`, [p.data.serviceId]);
    if (!svc) throw new DomainError("NOT_FOUND", "Service not available for online requests.");
    const slots = await findSlots({ ...p.data, therapistId: p.data.therapistId ?? null, enforceLeadTime: true });
    const list = p.data.therapistId ? slots : distinctStarts(slots);
    return { slots: list.map((s) => ({ startsAt: new Date(s.starts_at).toISOString(), endsAt: new Date(s.ends_at).toISOString() })) };
  });
}
