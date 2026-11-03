import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { Markdown, headings } from "@/components/site/markdown";
import { POLICIES } from "@/content/policies";
import { getPublicBranches, getPublicClinic } from "@/modules/content/public";
import { displayPhone } from "@/lib/format";

type Kind = keyof typeof POLICIES;

export function policyMetadata(kind: Kind): Metadata {
  const p = POLICIES[kind];
  return { title: p.title, description: p.description, alternates: { canonical: `/${kind}` } };
}

export async function PolicyPage({ kind }: { kind: Kind }) {
  const p = POLICIES[kind];
  const [clinic, branches] = await Promise.all([getPublicClinic(), getPublicBranches()]);
  const b = branches[0];
  const phone = b?.phone ?? clinic?.phone;
  const address = b?.addressVerified ? [b.addressLine, b.locality, b.city, b.postalCode].filter(Boolean).join(", ") : "HSR Layout, Bengaluru";
  const body = p.body
    .replaceAll("{{clinic}}", clinic?.tradeName ?? "Physio Central")
    .replaceAll("{{phone}}", phone ? displayPhone(phone) : "the clinic")
    .replaceAll("{{address}}", address)
    .replaceAll("{{email_sentence}}", clinic?.email ? ` or email ${clinic.email}.` : ".");
  const toc = headings(body);

  return (
    <>
      <PageHero eyebrow="Policies" title={p.title} lead={<span className="body-medium">Last updated {p.updated}</span>} />
      <div className="wrap section grid gap-12 lg:grid-cols-[16rem_1fr]">
        {toc.length > 2 ? (
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-28">
              <p className="title-small">On this page</p>
              <ul className="body-medium mt-3 space-y-2 border-l border-[var(--color-line)] pl-4">
                {toc.map((h) => <li key={h.id}><a href={`#${h.id}`} className="text-[var(--color-ink-muted)] no-underline hover:text-[var(--color-ink)] hover:underline">{h.text}</a></li>)}
              </ul>
            </div>
          </nav>
        ) : <div className="hidden lg:block" />}
        <article className="max-w-[68ch] [&>div>h2:first-child]:mt-0">
          <Markdown source={body} />
        </article>
      </div>
    </>
  );
}
