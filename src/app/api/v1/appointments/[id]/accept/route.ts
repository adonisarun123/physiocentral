import { z } from "zod";
import { headers } from "next/headers";
import { DomainError } from "@/lib/errors";
import { assertSameOrigin, jsonRoute } from "@/lib/http";
import { auth } from "@/modules/auth/auth";
import { loadStaffActor } from "@/modules/auth/actor";
import { acceptAppointment } from "@/modules/scheduling/appointments";

export const dynamic = "force-dynamic";

const body = z.object({
  expectedVersion: z.number().int().positive(),
  therapistId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
});

/** POST /api/v1/appointments/{id}/accept — contract from spec §19.3. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return jsonRoute(async (cid) => {
    await assertSameOrigin();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) throw new DomainError("UNAUTHENTICATED", "Sign in required.");
    const actor = await loadStaffActor(session.user.id);
    if (!actor) throw new DomainError("FORBIDDEN", "Not a staff account.");
    const parsed = body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new DomainError("VALIDATION", "Invalid body.");
    const { id } = await params;
    const r = await acceptAppointment(actor, { appointmentId: id, ...parsed.data }, cid);
    return { ...r, timezone: "Asia/Kolkata" };
  });
}
