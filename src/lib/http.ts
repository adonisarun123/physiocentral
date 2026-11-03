import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { correlationId, errorBody } from "@/lib/errors";

/** Client IP only from trusted proxy headers (SEC-09). Set TRUST_PROXY=1 behind a known proxy (e.g. Vercel). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  if (process.env.TRUST_PROXY === "1") {
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    const real = h.get("x-real-ip");
    if (real) return real;
  }
  return "unknown";
}

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export async function jsonRoute(fn: (cid: string) => Promise<unknown>, status = 200) {
  const cid = correlationId();
  try {
    const data = await fn(cid);
    return NextResponse.json({ data, correlationId: cid }, { status, headers: PRIVATE_HEADERS });
  } catch (err) {
    const { status: s, body } = errorBody(err, cid);
    return NextResponse.json(body, { status: s, headers: PRIVATE_HEADERS });
  }
}

/** Same-origin check for cookie-authenticated mutating Route Handlers (SEC-03, CSRF). */
export async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    const { DomainError } = await import("@/lib/errors");
    throw new DomainError("FORBIDDEN", "Cross-origin request refused.");
  }
}
