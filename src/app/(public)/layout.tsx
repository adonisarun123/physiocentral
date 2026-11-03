import Link from "next/link";
import { ArrowRight, Phone, CalendarCheck, Mail, MapPin } from "lucide-react";
import { getPublicBranches, getPublicClinic } from "@/modules/content/public";
import { telHref, displayPhone } from "@/lib/format";
import { Logo } from "@/components/site/logo";
import { RevealRoot } from "@/components/site/reveal";

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
      <RevealRoot />
      <header className="z-40 sm:sticky sm:top-0">
        <div className="border-b border-white/60 bg-white/75 backdrop-blur-xl backdrop-saturate-150">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="no-underline" aria-label={`${name} home`}><Logo name={name} /></Link>
            <nav aria-label="Main" className="order-3 -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
              <ul className="flex items-center gap-1 whitespace-nowrap text-[0.95rem]">
                {NAV.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} className="rounded-full px-3 py-2 font-medium text-[var(--color-ink)] no-underline transition-colors hover:bg-[var(--color-brand-soft)] hover:text-[var(--color-brand)]">{n.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="flex items-center gap-2">
              {phone ? (
                <a href={telHref(phone)} className="btn btn-secondary btn-sm hidden lg:inline-flex"><Phone size={16} aria-hidden="true" /> {displayPhone(phone)}</a>
              ) : null}
              <Link href="/book" className="btn btn-primary btn-sm hidden sm:inline-flex">Book appointment <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
          </div>
        </div>
      </header>

      <main id="main" className="pb-24 sm:pb-0">{children}</main>

      <div className="no-print fixed inset-x-3 bottom-3 z-30 flex gap-2 rounded-full border border-[var(--color-line)] bg-white/90 p-1.5 shadow-lg backdrop-blur sm:hidden">
        <Link href="/book" className="btn btn-primary flex-1"><CalendarCheck size={18} aria-hidden="true" /> Book</Link>
        {phone ? <a href={telHref(phone)} className="btn btn-secondary flex-1"><Phone size={18} aria-hidden="true" /> Call</a> : null}
      </div>

      <footer className="aurora relative bg-[var(--color-ink)] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo name={name} inverted size={46} />
            <p className="mt-5 max-w-xs text-white/75">
              {clinic?.identityVerified && clinic.legalName ? clinic.legalName : "Physiotherapy assessment and rehabilitation — built around how you move."}
            </p>
            <Link href="/book" className="btn btn-primary mt-6">Request an appointment <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <nav aria-label="Footer: clinic">
            <p className="font-display text-sm font-bold uppercase tracking-widest text-white/60">Clinic</p>
            <ul className="mt-4 space-y-2.5">
              {NAV.map((n) => <li key={n.href}><Link href={n.href} className="text-white/85 no-underline hover:text-white">{n.label}</Link></li>)}
            </ul>
          </nav>
          <div>
            <p className="font-display text-sm font-bold uppercase tracking-widest text-white/60">Contact</p>
            <ul className="mt-4 space-y-2.5 text-white/85">
              <li className="flex items-center gap-2"><Phone size={16} aria-hidden="true" />{phone ? <a href={telHref(phone)} className="text-white/85 no-underline hover:text-white">{displayPhone(phone)}</a> : "Coming soon"}</li>
              {clinic?.email ? <li className="flex items-center gap-2"><Mail size={16} aria-hidden="true" /><a href={`mailto:${clinic.email}`} className="text-white/85 no-underline hover:text-white">{clinic.email}</a></li> : null}
              <li className="flex items-center gap-2"><MapPin size={16} aria-hidden="true" /><Link href="/locations/main" className="text-white/85 no-underline hover:text-white">Hours &amp; directions</Link></li>
            </ul>
          </div>
          <nav aria-label="Footer: policies">
            <p className="font-display text-sm font-bold uppercase tracking-widest text-white/60">Policies</p>
            <ul className="mt-4 space-y-2.5">
              <li><Link href="/privacy" className="text-white/85 no-underline hover:text-white">Privacy notice</Link></li>
              <li><Link href="/terms" className="text-white/85 no-underline hover:text-white">Terms</Link></li>
              <li><Link href="/cancellation-refunds" className="text-white/85 no-underline hover:text-white">Cancellation &amp; refunds</Link></li>
              <li><Link href="/accessibility" className="text-white/85 no-underline hover:text-white">Accessibility</Link></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-white/70 sm:px-6">
            <p>© {name}</p>
            <p>General information only — not a diagnosis. In an emergency call 112.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
