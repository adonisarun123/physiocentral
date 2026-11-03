import { randomUUID } from "node:crypto";

/** Domain error with a stable code and a patient/staff-safe message (§19.1). */
export class DomainError extends Error {
  constructor(
    public code:
      | "UNAUTHENTICATED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "VALIDATION"
      | "STALE_VERSION"
      | "SLOT_UNAVAILABLE"
      | "PROPOSAL_REQUIRED"
      | "IDEMPOTENCY_CONFLICT"
      | "INVALID_TRANSITION"
      | "ALREADY_BILLED"
      | "INSUFFICIENT_FUNDS"
      | "FEATURE_DISABLED"
      | "RATE_LIMITED",
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }

  get httpStatus(): number {
    switch (this.code) {
      case "UNAUTHENTICATED": return 401;
      case "FORBIDDEN": return 403;
      case "NOT_FOUND": return 404;
      case "STALE_VERSION":
      case "SLOT_UNAVAILABLE":
      case "IDEMPOTENCY_CONFLICT":
      case "ALREADY_BILLED":
      case "PROPOSAL_REQUIRED": return 409;
      case "RATE_LIMITED": return 429;
      case "FEATURE_DISABLED": return 501;
      default: return 422;
    }
  }
}

export function correlationId(): string {
  return randomUUID();
}

/** Consistent JSON error body; never leaks stack traces or DB details. */
export function errorBody(err: unknown, cid: string) {
  if (err instanceof DomainError) {
    return {
      status: err.httpStatus,
      body: { error: { code: err.code, message: err.message, fieldErrors: err.fieldErrors }, correlationId: cid },
    };
  }
  console.error(`[${cid}]`, err instanceof Error ? err.message : err);
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: "Something went wrong. Please try again." }, correlationId: cid },
  };
}
