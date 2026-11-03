import type { Metadata } from "next";
import { requireStaff, getSessionInfo } from "@/modules/auth/session";
import { PageHeader } from "@/components/ui";
import { MfaSetup } from "./mfa-setup";
import { ChangePassword } from "./change-password";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  await requireStaff();
  const session = await getSessionInfo();
  const enabled = Boolean((session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled);
  return (
    <>
      <PageHeader title="Security" lead="Two-step verification (TOTP) protects staff accounts that can see patient and financial data." />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-lg font-bold">Two-step verification</h2>
          {enabled ? <p className="font-semibold text-[var(--color-ok)]">Two-step verification is on.</p> : <MfaSetup />}
        </section>
        <section className="card">
          <h2 className="mb-3 text-lg font-bold">Change password</h2>
          <p className="mb-3 text-sm text-[var(--color-ink-muted)]">If you were given a temporary password, change it now.</p>
          <ChangePassword />
        </section>
      </div>
    </>
  );
}
