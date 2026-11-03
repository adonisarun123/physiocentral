export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">{children}</main>;
}
