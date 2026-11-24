import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/modules/auth/session";
import { DomainError } from "@/lib/errors";
import { displayPhone, formatDate, patientNumber } from "@/lib/format";
import { dosageLine, getHomeProgramme } from "@/modules/clinical/exercises";
import { PrintButton } from "../../print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home exercise sheet" };

export default async function ExerciseSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff("CLINICAL_NOTES_READ");
  const { id } = await params;
  let h;
  try {
    h = await getHomeProgramme(actor, id);
  } catch (e) {
    if (e instanceof DomainError && e.code === "FORBIDDEN") redirect("/admin/forbidden");
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  return (
    <article>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <a href={`/admin/chart/${h.patient.id}`}>← Clinical record</a>
        <PrintButton />
      </div>
      {h.status === "STOPPED" ? <p className="mb-4 border-2 border-[var(--color-ink)] p-2 font-bold">This sheet has been stopped. Follow your most recent sheet.</p> : null}
      <header className="border-b-2 border-[var(--color-ink)] pb-3">
        <p className="text-xl font-extrabold">{h.clinic.name}</p>
        {h.clinic.address || h.clinic.phone ? <p className="text-sm">{[h.clinic.address, h.clinic.phone ? displayPhone(h.clinic.phone) : null].filter(Boolean).join(" · ")}</p> : null}
        <h1 className="mt-2 text-2xl font-bold">{h.title}</h1>
        <p>For <strong>{h.patient.full_name}</strong> ({patientNumber(h.patient)}) · given {formatDate(h.created_at)} by {h.author_name}</p>
      </header>
      <ol className="mt-4 space-y-4">
        {h.items.map((i) => (
          <li key={i.position} className="break-inside-avoid border-b border-[var(--color-line)] pb-3">
            <h2 className="text-lg font-bold">{i.position}. {i.name}</h2>
            {dosageLine(i) ? <p className="font-semibold">{dosageLine(i)}</p> : null}
            <p className="mt-1 whitespace-pre-line">{i.instructions}</p>
            {i.note ? <p className="mt-1 italic">{i.note}</p> : null}
          </li>
        ))}
      </ol>
      {h.advice ? <section className="mt-4"><h2 className="font-bold">Advice</h2><p className="whitespace-pre-line">{h.advice}</p></section> : null}
      {/* Wording approved by Dr Nitin N Sunku (clinic head), Nov 2026: shown on every sheet in his name. */}
      <p className="mt-6 text-sm">If an exercise causes pain that doesn&apos;t settle, stop it and contact the clinic{h.clinic.phone ? ` on ${displayPhone(h.clinic.phone)}` : ""}.
        <span className="mt-1 block font-semibold">— Dr Nitin N Sunku</span></p>
    </article>
  );
}
