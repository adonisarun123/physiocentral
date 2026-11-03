import { DomainError } from "@/lib/errors";
import { clientIp, jsonRoute } from "@/lib/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { normalizeIndianPhone } from "@/modules/patients/contact";
import { createBookingRequest } from "@/modules/scheduling/booking";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/booking-requests — same domain service as the booking form's
 * Server Action. Idempotency-Key header (or body.idempotencyKey) is required.
 */
export async function POST(req: Request) {
  return jsonRoute(async (cid) => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new DomainError("VALIDATION", "Expected a JSON body.");
    const key = req.headers.get("idempotency-key") ?? body.idempotencyKey;
    if (!key) throw new DomainError("VALIDATION", "Idempotency-Key header is required.");
    await rateLimit(`booking:ip:${await clientIp()}`, 20, 3600);
    const phone = typeof body.phone === "string" ? normalizeIndianPhone(body.phone) : null;
    if (phone) await rateLimit(`booking:phone:${phone}`, 5, 3600);
    return createBookingRequest({ ...body, idempotencyKey: key }, { source: "WEB", actorLabel: "public:api", correlationId: cid });
  }, 201);
}
