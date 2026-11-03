import { Notice } from "@/components/ui";
import { PageHero } from "@/components/site/page-hero";

const SUMMARY: Record<string, string> = {
  privacy:
    "We collect only what is needed to handle your appointment request: name, contact number, optional email, and an optional short reason for visit. Detailed medical history is collected later through a secure intake. Marketing messages are sent only if you opt in, and you can withdraw at any time.",
  terms: "Use of this website is subject to terms the clinic will publish here.",
  "cancellation-refunds":
    "An appointment request is not a confirmed booking until the clinic confirms it. The clinic's cancellation, no-show and refund policy will be published here before online payments are offered.",
  accessibility:
    "We aim to meet WCAG 2.2 AA. If anything on this site is hard to use, or you need help at the clinic (for example step-free access or a longer appointment), please call us or mention it in your request.",
};

/** Policy text is a DRAFT until approved by the clinic and its advisers (§24). */
export function PolicyPage({ title, kind }: { title: string; kind: string }) {
  return (
    <>
      <PageHero eyebrow="Policies" title={title} />
      <div className="wrap section max-w-3xl">
        <Notice tone="warn" title="Draft — awaiting clinic approval">
          This page holds a plain-language summary. The approved policy text will replace it before launch.
        </Notice>
        <p className="body-large prose-clinic mt-8">{SUMMARY[kind]}</p>
      </div>
    </>
  );
}
