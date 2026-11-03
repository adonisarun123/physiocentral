import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Terms of use", alternates: { canonical: "/terms" } };

export default function Page() {
  return <PolicyPage title="Terms of use" kind="terms" />;
}
