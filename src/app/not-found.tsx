import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-3xl font-extrabold">Page not found</h1>
      <p className="mt-3">The page you asked for doesn&apos;t exist or has moved.</p>
      <Link href="/" className="btn btn-primary mt-6">Go to the home page</Link>
    </main>
  );
}
