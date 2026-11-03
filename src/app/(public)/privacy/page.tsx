import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Privacy notice", alternates: { canonical: "/privacy" } };

export default function Page() {
  return <PolicyPage title="Privacy notice" kind="privacy" />;
}
