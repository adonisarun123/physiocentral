import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Cancellation and refunds", alternates: { canonical: "/cancellation-refunds" } };

export default function Page() {
  return <PolicyPage title="Cancellation and refunds" kind="cancellation-refunds" />;
}
