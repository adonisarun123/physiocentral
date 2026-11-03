"use server";

import { correlationId, DomainError } from "@/lib/errors";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { normalizeIndianPhone } from "@/modules/patients/contact";
import { createBookingRequest, type BookingRequestResult } from "@/modules/scheduling/booking";

export type BookingActionState =
  | { ok: true; result: BookingRequestResult }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

/** Public booking command (§5). Rate limited by IP and contact (BOOK-03), honeypot-protected, idempotent. */
export async function submitBookingRequest(payload: Record<string, unknown>): Promise<BookingActionState> {
  const cid = correlationId();
  try {
    if (typeof payload.website === "string" && payload.website.length > 0) {
      // Honeypot filled: respond generically without creating anything.
      throw new DomainError("VALIDATION", "Please check your details and try again.");
    }
    const ip = await clientIp();
    await rateLimit(`booking:ip:${ip}`, 20, 3600);
    const phone = typeof payload.phone === "string" ? normalizeIndianPhone(payload.phone) : null;
    if (phone) await rateLimit(`booking:phone:${phone}`, 5, 3600);
    const result = await createBookingRequest(payload, { source: "WEB", actorLabel: "public:web", correlationId: cid });
    return { ok: true, result };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message, code: err.code, fieldErrors: err.fieldErrors };
    console.error(`[${cid}] booking failed`, err instanceof Error ? err.message : err);
    return { ok: false, error: "We could not send your request just now. Please try again, or call the clinic." };
  }
}
