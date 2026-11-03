import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Accessibility", alternates: { canonical: "/accessibility" } };

export default function Page() {
  return <PolicyPage title="Accessibility" kind="accessibility" />;
}
