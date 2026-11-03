import { PolicyPage, policyMetadata } from "@/components/policy-page";

export const dynamic = "force-dynamic";
export const metadata = policyMetadata("privacy");

export default function Page() {
  return <PolicyPage kind="privacy" />;
}
