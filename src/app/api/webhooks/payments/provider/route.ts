import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Online payments are DISABLED in this release (§10.3, §1.2). This endpoint
 * deliberately accepts nothing so no unverified event can mark money as paid.
 * When a provider is onboarded: verify the signature over the raw body, persist
 * to a webhook inbox with event-ID dedupe, acknowledge, then process idempotently.
 */
export async function POST() {
  return NextResponse.json(
    { error: { code: "FEATURE_DISABLED", message: "Online payments are not enabled." } },
    { status: 501, headers: { "Cache-Control": "no-store" } },
  );
}
