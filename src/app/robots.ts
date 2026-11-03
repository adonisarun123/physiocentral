import type { MetadataRoute } from "next";
import { siteUrl } from "@/modules/content/schema";

/**
 * Private areas are protected by authentication, not robots (SEO-04). They are
 * not disallowed here so crawlers can still see their noindex header.
 * Non-production deployments disallow everything.
 */
export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_ENV !== "production") return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/" }, sitemap: siteUrl("/sitemap.xml") };
}
