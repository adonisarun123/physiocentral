import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/modules/auth/session";
import { PageHeader, Notice } from "@/components/ui";
import { patientNumber } from "@/lib/format";
import { assertCareTeam } from "@/modules/clinical/access";
import { listExercises } from "@/modules/clinical/exercises";
import { q } from "@/lib/db";
import { HomeProgrammeForm } from "@/components/clinical/home-programme-form";
import { orDeny } from "../../load";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New exercise sheet", robots: { index: false, follow: false } };

export default async function NewExerciseSheetPage({ params }: { params: Promise<{ patientId: string }> }) {
  const actor = await requireStaff("CLINICAL_NOTES_WRITE");
  const { patientId } = await params;
  const { patient } = await orDeny(assertCareTeam(actor, patientId, "CLINICAL_NOTES_WRITE"));
  const [exercises, episodes] = await Promise.all([
    listExercises(actor),
    q<{ id: string; title: string }>(`SELECT id, title FROM care_episode WHERE patient_id=$1 AND status='OPEN' ORDER BY opened_on DESC`, [patient.id]),
  ]);
  return (
    <>
      <p className="mb-2 text-sm"><Link href={`/admin/chart/${patient.id}`}>← Clinical record</Link></p>
      <PageHeader title="New home exercise sheet" lead={<>{patient.full_name} · <span className="font-mono">{patientNumber(patient)}</span></>} />
      {exercises.length === 0 ? (
        <div className="mb-4"><Notice>The exercise library is empty, so type each exercise below. <Link href="/admin/exercises">Add exercises to the library</Link> to pick them next time.</Notice></div>
      ) : null}
      <section className="card"><HomeProgrammeForm patientId={patient.id} exercises={exercises} episodes={episodes} /></section>
    </>
  );
}
