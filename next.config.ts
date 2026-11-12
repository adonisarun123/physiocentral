import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import path from "node:path";

// Security headers (SEC-05). CSP keeps to self plus Google Analytics 4 (gtag.js,
// public pages only). 'unsafe-inline' for scripts is required by Next's inline
// bootstrap without a nonce setup; tighten with nonces before enabling any
// third-party checkout origin.
//
// 'unsafe-eval' is added for `next dev` only: React needs eval() there to rebuild
// server stack traces. It is keyed off the Next phase, not NODE_ENV, because a
// shell that exports NODE_ENV=production would otherwise serve the production
// policy in dev and raise an "eval() is not supported" console error.
const GA = "https://www.googletagmanager.com";
const GA_BEACON = "https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com";
const buildCsp = (isDev: boolean) => [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${GA}` + (isDev ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${GA_BEACON}`,
  "font-src 'self'",
  `connect-src 'self' ${GA_BEACON}`,
  // Google Maps embed on /contact.
  "frame-src https://www.google.com https://maps.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig = (phase: string): NextConfig => {
  const csp = buildCsp(phase === PHASE_DEVELOPMENT_SERVER);
  return {
  // Cache Components is off: every page touching the DB is explicitly dynamic and
  // private pages must never land in a shared cache (SEC-04).
  cacheComponents: false,
  poweredByHeader: false,
  // Pin the workspace root: a stray package-lock.json / node_modules in a parent
  // folder (e.g. the home directory) must not change module resolution.
  turbopack: { root: path.resolve(process.cwd()) },
  outputFileTracingRoot: path.resolve(process.cwd()),
  serverExternalPackages: ["pg"],
  // "Visit us" was merged into /contact (2026-11).
  async redirects() {
    return [{ source: "/locations/:slug", destination: "/contact#visit", permanent: true }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Overrides Vercel's default HSTS (which lacks includeSubDomains/preload).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        source: "/(admin|manage|api)/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
  };
};

export default nextConfig;
