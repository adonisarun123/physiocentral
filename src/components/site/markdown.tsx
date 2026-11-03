import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Tiny, dependency-free renderer for the trusted markdown subset used in
 * src/content (blog posts, policies). Builds React nodes — never injects HTML.
 *
 * Supported: "## h2", "### h3", paragraphs, "- " / "1. " lists,
 * "> " callouts (first line may be "> **Title**"), **bold**, *italic*, [text](href).
 */

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[2]) out.push(<strong key={k}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={k}>{m[3]}</em>);
    else if (m[4] && m[5]) {
      const href = m[5];
      out.push(
        href.startsWith("/") || href.startsWith("#")
          ? <Link key={k} href={href}>{m[4]}</Link>
          : <a key={k} href={href} target="_blank" rel="noopener">{m[4]}</a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function slugifyHeading(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function headings(md: string) {
  return md.split("\n").filter((l) => l.startsWith("## ")).map((l) => ({ id: slugifyHeading(l.slice(3)), text: l.slice(3).trim() }));
}

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const blocks = source.trim().split(/\n\s*\n/);
  const nodes: ReactNode[] = [];
  blocks.forEach((raw, bi) => {
    const block = raw.trim();
    const k = `b${bi}`;
    if (block.startsWith("### ")) {
      const t = block.slice(4).trim();
      nodes.push(<h3 key={k} id={slugifyHeading(t)} className="title-large mt-8 scroll-mt-28">{inline(t, k)}</h3>);
    } else if (block.startsWith("## ")) {
      const t = block.slice(3).trim();
      nodes.push(<h2 key={k} id={slugifyHeading(t)} className="headline-small mt-12 scroll-mt-28">{inline(t, k)}</h2>);
    } else if (/^(- |\d+\. )/.test(block)) {
      const ordered = /^\d+\. /.test(block);
      const items = block.split("\n").map((l) => l.replace(/^(- |\d+\. )/, "").trim()).filter(Boolean);
      const List = ordered ? "ol" : "ul";
      nodes.push(
        <List key={k} className={`mt-4 space-y-2 pl-6 ${ordered ? "list-decimal" : "list-disc"} marker:text-[var(--md-sys-color-tertiary)]`}>
          {items.map((it, ii) => <li key={ii}>{inline(it, `${k}-${ii}`)}</li>)}
        </List>,
      );
    } else if (block.startsWith("> ")) {
      const lines = block.split("\n").map((l) => l.replace(/^>\s?/, ""));
      const titleMatch = /^\*\*(.+)\*\*$/.exec(lines[0].trim());
      const title = titleMatch ? titleMatch[1] : null;
      const body = (title ? lines.slice(1) : lines).join(" ").trim();
      nodes.push(
        <aside key={k} className="card-filled mt-6 border-l-4 border-[var(--md-sys-color-primary)]">
          {title ? <p className="title-medium">{title}</p> : null}
          <p className={title ? "mt-1" : ""}>{inline(body, k)}</p>
        </aside>,
      );
    } else {
      nodes.push(<p key={k} className="mt-4">{inline(block.replace(/\n/g, " "), k)}</p>);
    }
  });
  return <div className={`body-large text-[var(--color-ink)] [&_a]:text-[var(--md-sys-color-primary)] [&_a]:underline ${className}`}>{nodes}</div>;
}
