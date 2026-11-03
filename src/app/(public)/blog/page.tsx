import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { MediaPanel } from "@/components/site/media";
import { sortedPosts, readingMinutes, fmtDate } from "@/content/blog/posts";

export const metadata: Metadata = {
  title: "Blog — physiotherapy & recovery guides",
  description: "Practical guides on injury recovery, rehab after surgery, back pain and joint problems from the Physio Central clinical team in HSR Layout, Bengaluru.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndex() {
  const posts = sortedPosts();
  const [lead, ...rest] = posts;
  return (
    <>
      <PageHero eyebrow="Blog" title="Recovery guides & advice" lead="Plain-language guides on injuries, surgery recovery and everyday aches, written by our clinical team. General information, not a diagnosis." />
      <div className="wrap section">
        {lead ? (
          <Link href={`/blog/${lead.slug}`} className="group grid gap-8 no-underline lg:grid-cols-[1.2fr_1fr] lg:items-center" data-reveal>
            <MediaPanel icon="Activity" src={lead.image} alt={lead.imageAlt} priority sizes="(min-width: 1024px) 55vw, 100vw" className="aspect-[16/10] rounded-[var(--md-sys-shape-xl)]" />
            <div>
              <span className="label-large text-[var(--md-sys-color-tertiary)]">{lead.category}</span>
              <h2 className="headline-large mt-2 text-[var(--color-ink)] group-hover:underline">{lead.title}</h2>
              <p className="body-large mt-4 text-[var(--color-ink-muted)]">{lead.description}</p>
              <p className="body-small mt-4 text-[var(--color-ink-muted)]">{fmtDate(lead.date)} · {readingMinutes(lead.body)} min read</p>
              <span className="link-arrow mt-5 inline-flex text-[var(--md-sys-color-primary)]">Read article <ArrowRight size={16} aria-hidden="true" /></span>
            </div>
          </Link>
        ) : <p className="body-large">Articles are on their way.</p>}

        {rest.length ? (
          <ul className="mt-20 grid gap-x-8 gap-y-14 border-t border-[var(--color-line)] pt-14 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((p, i) => (
              <li key={p.slug} data-reveal={String((i % 3) * 80)}>
                <Link href={`/blog/${p.slug}`} className="group flex h-full flex-col no-underline">
                  <MediaPanel icon="Activity" index={i} src={p.image} alt={p.imageAlt} className="aspect-[16/10] rounded-[var(--md-sys-shape-md)]" />
                  <span className="label-large mt-5 text-[var(--md-sys-color-tertiary)]">{p.category}</span>
                  <span className="headline-small mt-1 text-[var(--color-ink)] group-hover:underline">{p.title}</span>
                  <span className="body-medium mt-2 line-clamp-3 text-[var(--color-ink-muted)]">{p.description}</span>
                  <span className="body-small mt-4 text-[var(--color-ink-muted)]">{fmtDate(p.date)} · {readingMinutes(p.body)} min read</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}
