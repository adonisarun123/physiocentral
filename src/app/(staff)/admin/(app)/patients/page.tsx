import type { Metadata } from "next";
import { requireStaff } from "@/modules/auth/session";
import { PageHeader } from "@/components/ui";
import { PatientPicker } from "@/components/admin/patient-picker";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Patients" };

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; patient?: string }> }) {
  const actor = await requireStaff("PATIENT_CONTACT_VIEW");
  const sp = await searchParams;
  if (sp.patient && /^[0-9a-f-]{36}$/i.test(sp.patient)) {
    const { redirect } = await import("next/navigation");
    redirect(`/admin/patients/${sp.patient}`);
  }
  return (
    <>
      <PageHeader title="Patients" lead="Online requests create a new record each time; if someone already exists, use their existing record for new bookings and bills." />
      <PatientPicker orgId={actor.organizationId} target="/admin/patients" term={(sp.q ?? "").trim()} />
    </>
  );
}
