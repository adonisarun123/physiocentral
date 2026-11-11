import Link from "next/link";
import { ArrowRight, Phone, CalendarCheck, MapPin, ChevronDown, Clock } from "lucide-react";
import { NavDrawer } from "@/components/site/nav-drawer";
import { getOpeningHours, getPublicBranches, getPublicClinic } from "@/modules/content/public";
import { telHref, displayPhone, dayHours, groupHours } from "@/lib/format";
import { Logo } from "@/components/site/logo";
import { RevealRoot } from "@/components/site/reveal";
import { GoogleAnalytics } from "@/components/site/google-analytics";
import { OrthoReferralBand, ORTHO } from "@/components/site/ortho-referral";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/services", label: "Services" },
  { href: "/pricing", label: "Pricing" },
  { href: "/team", label: "Our team" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact & visit" },
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [clinic, branches] = await Promise.all([getPublicClinic(), getPublicBranches()]);
  const branch = branches[0];
  const hours = branch ? await getOpeningHours(branch.id) : [];
  const phone = branch?.phone ?? clinic?.phone ?? null;
  const name = clinic?.tradeName ?? "Physio Central";
  const area = branch?.locality ? branch.locality.replace(/,.*$/, "") : "Bengaluru";
  const weekdayHours = dayHours(hours, 1);

  return (
    <>
      <RevealRoot />
      <GoogleAnalytics />
      {/* Utility strip (band) */}
      <div className="band on-band text-sm">
        <div className="wrap flex min-h-10 items-center justify-between gap-4">
          <span className="flex items-center gap-5">
            <span className="flex items-center gap-2"><MapPin size={14} aria-hidden="true" /> {area}, {branch?.city ?? "Bengaluru"}</span>
            {weekdayHours ? <span className="hidden items-center gap-2 md:flex"><Clock size={14} aria-hidden="true" /> Mon–Sat · {weekdayHours}</span> : null}
          </span>
          <span className="flex items-center gap-6">
            <Link href="/contact#visit" className="hidden text-[var(--md-sys-color-inverse-on-surface)] no-underline hover:underline sm:inline">Patient info</Link>
            {phone ? <a href={telHref(phone)} className="font-semibold text-white no-underline hover:underline">{displayPhone(phone)}</a> : null}
          </span>
        </div>
      </div>

      {/* Top app bar */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[var(--md-sys-color-surface)]/95 backdrop-blur">
        <div className="wrap flex h-20 items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <NavDrawer items={NAV} phone={phone ? (telHref(phone) ?? null) : null} phoneLabel={phone ? displayPhone(phone) : null} header={<Logo name={name} size={38} />} />
            <Link href="/" className="no-underline" aria-label={`${name} home`}><Logo name={name} /></Link>
            <Link href="/contact#visit" className="location-pill state ml-3 hidden 2xl:inline-flex whitespace-nowrap">
              <MapPin size={16} aria-hidden="true" /> {area} <ChevronDown size={16} aria-hidden="true" />
            </Link>
          </div>
          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV.map((n) => (
                <li key={n.href}><Link href={n.href} className="state inline-flex min-h-12 items-center whitespace-nowrap rounded-full px-3 text-[0.9375rem] font-medium text-[var(--color-ink)] no-underline">{n.label}</Link></li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/book" className="btn btn-primary hidden sm:inline-flex">Request appointment</Link>
          </div>
        </div>
      </header>

      <main id="main" className="pb-24 sm:pb-0">{children}</main>

      {/* Mobile bottom app bar: the booking action stays reachable */}
      <div className="no-print fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-[var(--color-line)] bg-[var(--md-sys-color-surface-container)] px-4 py-3 sm:hidden">
        <Link href="/book" className="btn btn-primary flex-1"><CalendarCheck size={18} aria-hidden="true" /> Book</Link>
        {phone ? <a href={telHref(phone)} className="btn btn-secondary flex-1"><Phone size={18} aria-hidden="true" /> Call</a> : null}
      </div>

      {/* Floating quick actions (desktop) */}
      <div className="fab-stack no-print">
        {phone ? <a href={telHref(phone)} className="fab fab-call" aria-label={`Call ${displayPhone(phone)}`} title="Call the clinic"><Phone size={22} aria-hidden="true" /></a> : null}
        <Link href="/book" className="fab fab-book" aria-label="Request an appointment" title="Request an appointment"><CalendarCheck size={22} aria-hidden="true" /></Link>
      </div>

      <OrthoReferralBand />

      <footer className="band on-band">
        <div className="wrap grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.2fr]">
          <div>
            <Logo name={name} inverted size={42} />
            {branch?.addressVerified && branch.addressLine ? (
              <address className="body-medium muted mt-6 max-w-xs not-italic">{[branch.addressLine, branch.locality, branch.city, branch.postalCode].filter(Boolean).join(", ")}</address>
            ) : null}
            <Link href="/book" className="btn btn-on-band mt-7">Request appointment <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <nav aria-label="Footer: clinic">
            <p className="title-small text-white">Quick links</p>
            <ul className="mt-4 space-y-3">
              {NAV.map((n) => <li key={n.href}><Link href={n.href} className="muted no-underline hover:text-white hover:underline">{n.label}</Link></li>)}
              <li><Link href="/book" className="muted no-underline hover:text-white hover:underline">Book online</Link></li>
              <li><a href={ORTHO.url} target="_blank" rel="noopener" className="muted no-underline hover:text-white hover:underline">Orthopaedic consultation ↗</a></li>
            </ul>
          </nav>
          <div>
            <p className="title-small text-white">Hours</p>
            {hours.length ? (
              <dl className="body-medium mt-4 space-y-3">
                {groupHours(hours).map((g) => <div key={g.days}><dt className="muted">{g.days}</dt><dd className="text-white">{g.hours}</dd></div>)}
              </dl>
            ) : <p className="muted mt-4">Call us for today&apos;s hours.</p>}
          </div>
          <div>
            <p className="title-small text-white">Contact</p>
            {phone ? <a href={telHref(phone)} className="font-display mt-4 block text-[1.6rem] leading-tight text-white no-underline hover:underline">{displayPhone(phone)}</a> : null}
            <ul className="mt-4 space-y-3">
              <li><Link href="/contact#visit" className="muted no-underline hover:text-white hover:underline">Get directions</Link></li>
              {clinic?.email ? <li><a href={`mailto:${clinic.email}`} className="muted no-underline hover:text-white hover:underline">{clinic.email}</a></li> : null}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/15">
          <div className="wrap body-small muted flex flex-wrap items-center justify-between gap-3 py-6">
            <p>© {new Date().getFullYear()} {name}. General information only — not a diagnosis. In an emergency call 112.</p>
            <nav aria-label="Footer: policies">
              <ul className="flex flex-wrap gap-5">
                <li><Link href="/privacy" className="muted no-underline hover:text-white hover:underline">Privacy</Link></li>
                <li><Link href="/terms" className="muted no-underline hover:text-white hover:underline">Terms</Link></li>
                <li><Link href="/cancellation-refunds" className="muted no-underline hover:text-white hover:underline">Cancellation &amp; refunds</Link></li>
                <li><Link href="/accessibility" className="muted no-underline hover:text-white hover:underline">Accessibility</Link></li>
              </ul>
            </nav>
          </div>
        </div>
      </footer>
    </>
  );
}
