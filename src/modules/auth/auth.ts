import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { nextCookies } from "better-auth/next-js";
import { getPool } from "@/lib/db";

/**
 * Staff authentication (SEC-02): Better Auth, a maintained library, with
 * Postgres-backed revocable sessions in HttpOnly cookies and TOTP MFA.
 * Public sign-up is disabled — staff accounts are created by invitation
 * (scripts/create-staff.ts) and linked to a staff_member row with role grants.
 */
export const auth = betterAuth({
  appName: "Physio Central",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: getPool(),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  session: {
    expiresIn: 60 * 60 * 12, // 12h absolute lifetime (spec §2.2 default)
    updateAge: 60 * 30,
    cookieCache: { enabled: false }, // always check DB so revocation is immediate
  },
  rateLimit: { enabled: true, window: 60, max: 30, storage: "database" },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
  },
  plugins: [twoFactor({ issuer: "Physio Central" }), nextCookies()],
});

export type Auth = typeof auth;
