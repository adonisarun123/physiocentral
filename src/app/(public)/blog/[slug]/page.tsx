import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, CalendarCheck } from "lucide-react";
import { MediaPanel } from "@/components/site/media";
import { Markdown, headings } from "@/components/site/markdown";
import { JsonLd, relatedLinkProp, siteUrl } from "@/modules/content/schema";
import { bodyLinkPaths, isContentPath, linksFor } from "@/content/link-map";
import { ORTHO } from "@/components/site/ortho-referral";
import { POSTS, getPost, readingMinutes, sortedPosts, fmtDate } from "@/content/blog/posts";
import { pageOpenGraph } from "@/lib/seo";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = getPost(slug);
  if (!p) return { title: "Article not found", robots: { index: false } };
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: `/blog/${p.slug}` },
    openGraph: pageOpenGraph(`/blog/${p.slug}`, { type: "article", title: p.title, description: p.description, images: [p.image], publishedTime: p.date, modifiedTime: p.updated ?? p.date }),
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getPost(slug);
  if (!p) notFound();
  const toc = headings(p.body);
  const related = sortedPosts().filter((x) => x.slug !== p.slug).slice(0, 3);
  const path = `/blog/${p.slug}`;
  // Editorial links to services this guide supports, minus any the body already links (no duplicate links).
  const inBody = bodyLinkPaths(p.body);
  const care = linksFor(path).filter((l) => l.anchor && !inBody.includes(l.to));
  // relatedLink mirrors the contextual content links a reader can see: those in the body plus the block below.
  const renderedPaths = [...inBody.filter(isContentPath), ...care.map((l) => l.to)];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": siteUrl(`${path}#page`),
        url: siteUrl(path),
        name: p.title,
        ...relatedLinkProp(renderedPaths),
      },
      {
        "@type": "BlogPosting",
        "@id": siteUrl(`${path}#article`),
        headline: p.title,
        description: p.description,
        image: siteUrl(p.image),
        datePublished: p.date,
        dateModified: p.updated ?? p.date,
        author: { "@type": "Organization", name: p.author },
        ...(p.reviewedBy ? { reviewedBy: { "@type": "Person", name: p.reviewedBy, ...(p.reviewedBy === ORTHO.name ? { jobTitle: "Consultant Orthopaedic Surgeon", identifier: ORTHO.registration, url: siteUrl("/about") } : {}) } } : {}),
        publisher: { "@id": siteUrl("/contact#clinic") },
        mainEntityOfPage: { "@id": siteUrl(`${path}#page`) },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Blog", item: siteUrl("/blog") },
          { "@type": "ListItem", position: 3, name: p.title, item: siteUrl(`/blog/${p.slug}`) },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={ld} />
      <article>
        <header className="border-b border-[var(--color-line)] bg-[var(--md-sys-color-surface-container-low)]">
          <div className="wrap max-w-4xl py-12 sm:py-16" data-reveal>
            <nav aria-label="Breadcrumb" className="body-small text-[var(--color-ink-muted)]">
              <Link href="/blog" className="inline-flex items-center gap-1 text-[var(--color-ink-muted)] no-underline hover:underline"><ArrowLeft size={14} aria-hidden="true" /> All articles</Link>
            </nav>
            <p className="eyebrow mt-6">{p.category}</p>
            <h1 className="display-small mt-3">{p.title}</h1>
            <p className="body-large mt-5 text-[var(--color-ink-muted)]">{p.description}</p>
            <p className="body-small mt-6 text-[var(--color-ink-muted)]">
              By {p.author} · <time dateTime={p.date}>{fmtDate(p.date)}</time> · {readingMinutes(p.body)} min read
              {p.reviewedBy ? <><br />Medically reviewed by <Link href="/about#doctor-h">{p.reviewedBy}</Link>{p.reviewedBy === ORTHO.name ? `, MS Orthopaedics (${ORTHO.registration})` : ""}</> : null}
            </p>
          </div>
        </header>

        <div className="wrap max-w-6xl pt-10">
          <MediaPanel icon="Activity" src={p.image} alt={p.imageAlt} priority sizes="(min-width: 1152px) 1152px, 100vw" className="aspect-[21/9] rounded-[var(--md-sys-shape-xl)]" />
        </div>

        <div className="wrap section grid max-w-6xl gap-12 pt-12 lg:grid-cols-[1fr_16rem]">
          <div className="max-w-[68ch]">
            <Markdown source={p.body} />
            {care.length ? (
              <aside aria-labelledby="care-h" className="card-filled mt-10">
                <h2 id="care-h" className="title-large">Related care at Physio Central</h2>
                <ul className="mt-3 space-y-2">
                  {care.map((l) => (
                    <li key={l.to}>
                      <Link href={l.to} className="link-arrow text-[var(--md-sys-color-primary)]">{l.anchor} <ArrowRight size={16} aria-hidden="true" /></Link>
                    </li>
                  ))}
                </ul>
              </aside>
            ) : null}
            <p className="body-small mt-12 border-t border-[var(--color-line)] pt-6 text-[var(--color-ink-muted)]">
              This article is general information, not a diagnosis or treatment plan. Always follow the advice of the clinician who knows your case. In an emergency, call 112.
            </p>
          </div>
          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-8">
              {toc.length > 2 ? (
                <nav aria-label="In this article">
                  <p className="title-small">In this article</p>
                  <ul className="body-medium mt-3 space-y-2 border-l border-[var(--color-line)] pl-4">
                    {toc.map((h) => <li key={h.id}><a href={`#${h.id}`} className="text-[var(--color-ink-muted)] no-underline hover:text-[var(--color-ink)] hover:underline">{h.text}</a></li>)}
                  </ul>
                </nav>
              ) : null}
              <div className="card-filled">
                <CalendarCheck size={22} aria-hidden="true" className="text-[var(--md-sys-color-primary)]" />
                <p className="title-medium mt-2">Need a proper assessment?</p>
                <p className="body-small mt-1 text-[var(--color-ink-muted)]">One-to-one with a physiotherapist, in HSR Layout.</p>
                <Link href="/book" className="btn btn-primary mt-4 w-full">Request appointment</Link>
              </div>
            </div>
          </aside>
        </div>
      </article>

      {related.length ? (
        <section className="bg-[var(--md-sys-color-surface-container)]" aria-labelledby="more-h">
          <div className="wrap section">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="more-h" className="headline-large">More guides</h2>
              <Link href="/blog" className="link-arrow text-[var(--md-sys-color-primary)]">All articles <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
            <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r, i) => (
                <li key={r.slug} data-reveal={String(i * 80)}>
                  <Link href={`/blog/${r.slug}`} className="group flex h-full flex-col no-underline">
                    <MediaPanel icon="Activity" index={i} src={r.image} alt={r.imageAlt} className="aspect-[16/10] rounded-[var(--md-sys-shape-md)]" />
                    <span className="label-large mt-4 text-[var(--md-sys-color-tertiary)]">{r.category}</span>
                    <span className="title-large mt-1 text-[var(--color-ink)] group-hover:underline">{r.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
