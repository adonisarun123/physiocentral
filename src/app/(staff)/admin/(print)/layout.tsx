import type { Metadata } from "next";
import { requireStaff } from "@/modules/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Print views render from immutable snapshots, without application chrome (§4.1). */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return <main id="main" className="mx-auto max-w-3xl bg-white p-6 sm:p-10">{children}</main>;
}
