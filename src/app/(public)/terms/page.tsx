import { PolicyPage, policyMetadata } from "@/components/policy-page";

export const dynamic = "force-dynamic";
export const metadata = policyMetadata("terms");

export default function Page() {
  return <PolicyPage kind="terms" />;
}
