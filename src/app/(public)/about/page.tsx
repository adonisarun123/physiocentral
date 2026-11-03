import type { Metadata } from "next";
import Link from "next/link";
import { getPublicClinic } from "@/modules/content/public";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "About", alternates: { canonical: "/about" } };

export default async function AboutPage() {
  const clinic = await getPublicClinic();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-extrabold">About {clinic?.tradeName ?? "the clinic"}</h1>
      {clinic?.identityVerified && clinic.legalName ? <p className="mt-2">Operated by {clinic.legalName}.</p> : null}
      <div className="mt-6">
        <Notice title="Content awaiting clinic approval">
          The clinic&apos;s history, approach and facilities will be published here after the owner approves the text. We do not publish invented patient counts, awards or outcome claims.
        </Notice>
      </div>
      <p className="mt-6"><Link href="/contact">Contact the clinic</Link></p>
    </div>
  );
}
