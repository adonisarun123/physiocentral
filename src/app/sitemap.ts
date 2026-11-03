import type { MetadataRoute } from "next";
import { getPublicServices, getPublicTherapists } from "@/modules/content/public";
import { siteUrl } from "@/modules/content/schema";
import { POSTS } from "@/content/blog/posts";

export const dynamic = "force-dynamic";

/** Strict allowlist of canonical, published, indexable pages (SEO-03). Never admin/portal/manage/book. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [services, team] = await Promise.all([getPublicServices(), getPublicTherapists()]);
  const statics = ["/", "/services", "/team", "/about", "/blog", "/contact", "/privacy", "/terms", "/cancellation-refunds", "/accessibility"];
  return [
    ...statics.map((p) => ({ url: siteUrl(p) })),
    ...services.map((s) => ({ url: siteUrl(`/services/${s.slug}`), lastModified: s.reviewedOn ?? undefined })),
    ...team.map((t) => ({ url: siteUrl(`/team/${t.slug}`) })),
    ...POSTS.map((p) => ({ url: siteUrl(`/blog/${p.slug}`), lastModified: p.updated ?? p.date })),
  ];
}
