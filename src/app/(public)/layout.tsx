import Link from "next/link";
import { getPublicBranches, getPublicClinic } from "@/modules/content/public";
import { telHref } from "@/lib/format";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/services", label: "Services" },
  { href: "/team", label: "Our Team" },
  { href: "/about", label: "About" },
  { href: "/locations/main", label: "Location" },
  { href: "/contact", label: "Contact" },
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [clinic, branches] = await Promise.all([getPublicClinic(), getPublicBranches()]);
  const phone = branches[0]?.phone ?? clinic?.phone ?? null;
  const name = clinic?.tradeName ?? "Physio Central";
  return (
    <>
      <header className="z-40 border-b sm:sticky sm:top-0 border-[var(--color-line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-extrabold text-[var(--color-brand-strong)] no-underline">
            {name}
          </Link>
          <nav aria-label="Main">
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.97rem]">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="font-medium text-[var(--color-ink)] underline-offset-4 hover:underline">{n.label}</Link>
                </li>
              ))}
              <li>
                <Link href="/book" className="btn btn-primary btn-sm">Book Appointment</Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="pb-24 sm:pb-0">{children}</main>

      {/* Mobile action bar: Book + Call. Body has bottom padding so it never covers content. */}
      <div className="no-print fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-[var(--color-line)] bg-white p-2 sm:hidden">
        <Link href="/book" className="btn btn-primary flex-1">Book</Link>
        {phone ? <a href={telHref(phone)} className="btn btn-secondary flex-1">Call</a> : null}
      </div>

      <footer className="mt-16 border-t border-[var(--color-line)] bg-[var(--color-surface-alt)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
          <div>
            <p className="font-bold">{name}</p>
            {clinic?.identityVerified && clinic.legalName ? <p className="text-sm">{clinic.legalName}</p> : (
              <p className="text-sm text-[var(--color-ink-muted)]">Legal business details are being confirmed.</p>
            )}
          </div>
          <div>
            <p className="font-bold">Contact</p>
            {phone ? <p><a href={telHref(phone)}>{phone}</a></p> : <p className="text-sm text-[var(--color-ink-muted)]">Phone number coming soon.</p>}
            {clinic?.email ? <p><a href={`mailto:${clinic.email}`}>{clinic.email}</a></p> : null}
            <p><Link href="/contact">Opening hours and directions</Link></p>
          </div>
          <nav aria-label="Policies">
            <p className="font-bold">Policies</p>
            <ul className="text-sm">
              <li><Link href="/privacy">Privacy notice</Link></li>
              <li><Link href="/terms">Terms</Link></li>
              <li><Link href="/cancellation-refunds">Cancellation and refunds</Link></li>
              <li><Link href="/accessibility">Accessibility</Link></li>
            </ul>
          </nav>
        </div>
      </footer>
    </>
  );
}
