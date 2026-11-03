import type { Metadata } from "next";
import Link from "next/link";
import { getPublicClinic } from "@/modules/content/public";
import { Notice } from "@/components/ui";
import { PageHero } from "@/components/site/page-hero";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "About", alternates: { canonical: "/about" } };

export default async function AboutPage() {
  const clinic = await getPublicClinic();
  return (
    <>
    <PageHero eyebrow="About us" title={<>About <em>{clinic?.tradeName ?? "the clinic"}</em></>} lead={clinic?.identityVerified && clinic.legalName ? `Operated by ${clinic.legalName}.` : undefined} />
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div>
        <Notice title="Content awaiting clinic approval">
          The clinic&apos;s history, approach and facilities will be published here after the owner approves the text. We do not publish invented patient counts, awards or outcome claims.
        </Notice>
      </div>
      <p className="mt-6"><Link href="/contact" className="btn btn-secondary">Contact the clinic</Link></p>
    </div>
    </>
  );
}
