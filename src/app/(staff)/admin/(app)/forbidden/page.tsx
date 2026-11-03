import Link from "next/link";
export default function Forbidden() {
  return (
    <div className="card max-w-xl">
      <h1 className="text-2xl font-bold">You don&apos;t have access to this page</h1>
      <p className="mt-2">Ask the clinic owner if your role should include it.</p>
      <Link href="/admin" className="btn btn-secondary mt-4">Back to dashboard</Link>
    </div>
  );
}
