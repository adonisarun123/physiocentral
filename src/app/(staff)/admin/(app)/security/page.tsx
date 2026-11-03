import type { Metadata } from "next";
import { requireStaff, getSessionInfo } from "@/modules/auth/session";
import { PageHeader } from "@/components/ui";
import { MfaSetup } from "./mfa-setup";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  await requireStaff();
  const session = await getSessionInfo();
  const enabled = Boolean((session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled);
  return (
    <>
      <PageHeader title="Security" lead="Two-step verification (TOTP) protects staff accounts that can see patient and financial data." />
      <div className="card max-w-xl">
        {enabled ? <p className="font-semibold text-[var(--color-ok)]">Two-step verification is on.</p> : <MfaSetup />}
      </div>
    </>
  );
}
