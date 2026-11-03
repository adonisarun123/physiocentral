import Link from "next/link";
import { ArrowRight, Phone, CalendarCheck } from "lucide-react";
import { getPublicBranches, getPublicClinic } from "@/modules/content/public";
import { telHref } from "@/lib/format";
import { Logo } from "@/components/site/logo";

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
  const branch = branches[0];
  const phone = branch?.phone ?? clinic?.phone ?? null;
  const name = clinic?.tradeName ?? "Physio Central";
  return (
    <>
      <div className="no-print bg-[var(--color-ink)] text-white">
        <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm">
          <span>New patient? Request an assessment online — the clinic confirms your time{branch ? ` ${branch.responseWindow}` : ""}.</span>
          <Link href="/book" className="inline-flex items-center gap-1 rounded-full border border-white/50 px-3 py-0.5 font-semibold text-white no-underline hover:bg-white/10">
            Request now <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>
      </div>

      <header className="z-40 border-b border-[var(--color-line)] bg-white/95 backdrop-blur sm:sticky sm:top-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="no-underline" aria-label={`${name} home`}><Logo name={name} /></Link>
          <nav aria-label="Main" className="order-3 -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
            <ul className="flex items-center gap-x-5 whitespace-nowrap text-[0.95rem]">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="font-medium text-[var(--color-ink)] no-underline hover:text-[var(--color-brand)]">{n.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-2">
            {phone ? (
              <a href={telHref(phone)} className="btn btn-secondary btn-sm hidden md:inline-flex"><Phone size={16} aria-hidden="true" /> {phone}</a>
            ) : null}
            <Link href="/book" className="btn btn-primary btn-sm hidden sm:inline-flex">Book appointment <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
      </header>

      <main id="main" className="pb-24 sm:pb-0">{children}</main>

      <div className="no-print fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-[var(--color-line)] bg-white p-2 sm:hidden">
        <Link href="/book" className="btn btn-primary flex-1"><CalendarCheck size={18} aria-hidden="true" /> Book</Link>
        {phone ? <a href={telHref(phone)} className="btn btn-secondary flex-1"><Phone size={18} aria-hidden="true" /> Call</a> : null}
      </div>

      <footer className="bg-[var(--color-ink)] text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Logo name={name} inverted />
            <p className="mt-4 text-sm text-white/80">
              {clinic?.identityVerified && clinic.legalName ? clinic.legalName : "Physiotherapy assessment and rehabilitation."}
            </p>
          </div>
          <nav aria-label="Footer: clinic">
            <p className="font-display text-lg font-semibold">Clinic</p>
            <ul className="mt-3 space-y-2 text-sm">
              {NAV.map((n) => <li key={n.href}><Link href={n.href} className="text-white/85 no-underline hover:text-white">{n.label}</Link></li>)}
              <li><Link href="/book" className="text-white/85 no-underline hover:text-white">Book appointment</Link></li>
            </ul>
          </nav>
          <div>
            <p className="font-display text-lg font-semibold">Contact</p>
            <ul className="mt-3 space-y-2 text-sm text-white/85">
              {phone ? <li><a href={telHref(phone)} className="text-white/85 no-underline hover:text-white">{phone}</a></li> : <li>Phone number coming soon</li>}
              {clinic?.email ? <li><a href={`mailto:${clinic.email}`} className="text-white/85 no-underline hover:text-white">{clinic.email}</a></li> : null}
              <li><Link href="/locations/main" className="text-white/85 no-underline hover:text-white">Hours &amp; directions</Link></li>
            </ul>
          </div>
          <nav aria-label="Footer: policies">
            <p className="font-display text-lg font-semibold">Policies</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/privacy" className="text-white/85 no-underline hover:text-white">Privacy notice</Link></li>
              <li><Link href="/terms" className="text-white/85 no-underline hover:text-white">Terms</Link></li>
              <li><Link href="/cancellation-refunds" className="text-white/85 no-underline hover:text-white">Cancellation &amp; refunds</Link></li>
              <li><Link href="/accessibility" className="text-white/85 no-underline hover:text-white">Accessibility</Link></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-white/15">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-white/70">
            This website gives general information and does not diagnose. In an emergency call 112.
          </p>
        </div>
      </footer>
    </>
  );
}
