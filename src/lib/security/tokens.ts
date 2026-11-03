import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256-bit URL-safe secret. Only its hash is ever stored (AUTH-06). */
export function newSecretToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/** Opaque public reference, e.g. PC-7KQ2-M9XD. Not an access credential. */
export function publicRef(prefix: string): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `${prefix}-${out.slice(0, 4)}-${out.slice(4)}`;
}

export function sha256Json(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)))
    .digest("hex");
}
