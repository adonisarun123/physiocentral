import { afterEach, describe, expect, it } from "vitest";
import { LINK_MAP, SERVICE_RELATIONS, bodyLinkPaths, isContentPath, linksFor, relatedServiceSlugs } from "@/content/link-map";
import { POSTS } from "@/content/blog/posts";
import { isRelatedToProp, relatedLinkProp } from "@/modules/content/schema";
import { SERVICES } from "../../scripts/content/services";

const serviceSlugs = new Set(SERVICES.map((s) => s.slug));
const postSlugs = new Set(POSTS.map((p) => p.slug));
const STATIC = new Set(["/services", "/pricing", "/team", "/about", "/blog", "/contact"]);

/** A path is valid when it is a published static page, a seeded service or an existing post. */
function resolves(path: string): boolean {
  if (STATIC.has(path)) return true;
  const svc = /^\/services\/([a-z0-9-]+)$/.exec(path);
  if (svc) return serviceSlugs.has(svc[1]);
  const post = /^\/blog\/([a-z0-9-]+)$/.exec(path);
  return post ? postSlugs.has(post[1]) : false;
}

describe("editorial link map", () => {
  it("every service has a relations entry, and every relation points at another real service", () => {
    for (const slug of serviceSlugs) expect(SERVICE_RELATIONS[slug], slug).toBeDefined();
    for (const [source, rels] of Object.entries(SERVICE_RELATIONS)) {
      expect(serviceSlugs.has(source), source).toBe(true);
      const targets = rels.map((r) => r.target);
      expect(new Set(targets).size, `${source} duplicates`).toBe(targets.length);
      for (const r of rels) {
        expect(serviceSlugs.has(r.target), `${source} -> ${r.target}`).toBe(true);
        expect(r.target, `${source} self-link`).not.toBe(source);
        expect(r.why.length, `${source} -> ${r.target} rationale`).toBeGreaterThan(10);
      }
    }
  });

  it("every source and destination is a real, canonical, same-site path", () => {
    for (const [source, links] of Object.entries(LINK_MAP)) {
      expect(resolves(source), `source ${source}`).toBe(true);
      const tos = links.map((l) => l.to);
      expect(new Set(tos).size, `${source} duplicates`).toBe(tos.length);
      for (const l of links) {
        expect(l.to.startsWith("/") && !l.to.startsWith("//"), `${l.to} must be root-relative`).toBe(true);
        expect(l.to, "no query, fragment or trailing slash").not.toMatch(/[?#]|.\/$/);
        expect(resolves(l.to), `${source} -> ${l.to}`).toBe(true);
        expect(l.to, `${source} self-link`).not.toBe(source);
        expect(l.why.length, `${source} -> ${l.to} rationale`).toBeGreaterThan(10);
      }
    }
  });

  it("links that cannot take their anchor from a post title carry explicit anchor text", () => {
    for (const [source, links] of Object.entries(LINK_MAP)) {
      for (const l of links) if (!l.to.startsWith("/blog/")) expect(l.anchor, `${source} -> ${l.to}`).toBeTruthy();
    }
  });

  it("guide records never repeat a link the article body already contains", () => {
    for (const p of POSTS) {
      const inBody = bodyLinkPaths(p.body);
      for (const l of linksFor(`/blog/${p.slug}`)) expect(inBody, `${p.slug} already links ${l.to}`).not.toContain(l.to);
    }
  });

  it("unapproved records are not rendered", () => {
    const rel = SERVICE_RELATIONS["home-visits"][0];
    rel.approved = false;
    try {
      expect(relatedServiceSlugs("home-visits")).not.toContain(rel.target);
    } finally {
      rel.approved = true;
    }
  });

  it("only content pages qualify for relatedLink", () => {
    expect(isContentPath("/services/home-visits")).toBe(true);
    expect(isContentPath("/pricing")).toBe(true);
    expect(isContentPath("/book")).toBe(false);
    expect(isContentPath("/cancellation-refunds")).toBe(false);
  });
});

describe("relationship schema helpers", () => {
  const prev = { site: process.env.NEXT_PUBLIC_SITE_URL, flag: process.env.RELATIONSHIP_SCHEMA };
  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = prev.site;
    if (prev.flag === undefined) delete process.env.RELATIONSHIP_SCHEMA;
    else process.env.RELATIONSHIP_SCHEMA = prev.flag;
  });

  it("emits absolute, de-duplicated page URLs and Service entities that reuse the existing @id", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.example.test/";
    delete process.env.RELATIONSHIP_SCHEMA;
    expect(relatedLinkProp(["/pricing", "/pricing", "/blog/x"])).toEqual({ relatedLink: ["https://www.example.test/pricing", "https://www.example.test/blog/x"] });
    expect(relatedLinkProp([])).toEqual({});
    expect(isRelatedToProp([{ slug: "home-visits", name: "Home Visits" }])).toEqual({
      isRelatedTo: [{ "@type": "Service", "@id": "https://www.example.test/services/home-visits#service", name: "Home Visits", url: "https://www.example.test/services/home-visits" }],
    });
  });

  it("RELATIONSHIP_SCHEMA=off removes the markup", () => {
    process.env.RELATIONSHIP_SCHEMA = "off";
    expect(relatedLinkProp(["/pricing"])).toEqual({});
    expect(isRelatedToProp([{ slug: "home-visits", name: "Home Visits" }])).toEqual({});
  });
});
