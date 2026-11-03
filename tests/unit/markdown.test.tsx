import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, headings } from "@/components/site/markdown";
import { POSTS } from "@/content/blog/posts";
import { POLICIES } from "@/content/policies";

describe("Markdown renderer", () => {
  it("renders headings, lists, bold and links", () => {
    const html = renderToStaticMarkup(<Markdown source={"## Hello world\n\n- **a** item\n- [ext](https://x.com)\n\nSee [book](/book)."} />);
    expect(html).toContain('<h2 id="hello-world"');
    expect(html).toContain("<strong>a</strong>");
    expect(html).toContain('href="https://x.com" target="_blank" rel="noopener"');
    expect(html).toContain('href="/book"');
  });
  it("never injects raw HTML", () => {
    const html = renderToStaticMarkup(<Markdown source={"<script>alert(1)</script>"} />);
    expect(html).not.toContain("<script>");
  });
  it("extracts h2 headings for the table of contents", () => {
    expect(headings("## One\n\ntext\n\n## Two")).toEqual([{ id: "one", text: "One" }, { id: "two", text: "Two" }]);
  });
});

describe("content", () => {
  it("blog slugs are unique and internal links point at real routes", () => {
    const slugs = POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const all = [...POSTS.map((p) => p.body), ...Object.values(POLICIES).map((p) => p.body)].join("\n");
    const internal = [...all.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1].split("#")[0]);
    const known = /^\/(book|contact|cancellation-refunds|privacy|terms|accessibility|blog(\/.*)?|services\/(post-surgical-rehabilitation|home-visits|spine-and-posture-care|orthopaedic-physiotherapy))$/;
    for (const l of internal) expect(l).toMatch(known);
  });
});
