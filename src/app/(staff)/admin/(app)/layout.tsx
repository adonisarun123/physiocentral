import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff, getSessionInfo } from "@/modules/auth/session";
import { can } from "@/modules/auth/actor";
import { SignOutButton } from "./sign-out";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaff();
  const session = await getSessionInfo();
  const mfaOn = Boolean((session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled);
  const nav = [
    { href: "/admin", label: "Dashboard", show: true },
    { href: "/admin/requests", label: "Request inbox", show: can(actor, "APPOINTMENT_VIEW") },
    { href: "/admin/calendar", label: "Calendar", show: can(actor, "APPOINTMENT_VIEW") },
    { href: "/admin/book", label: "+ New booking", show: can(actor, "APPOINTMENT_ACCEPT") },
    { href: "/admin/patients", label: "Patients", show: can(actor, "PATIENT_CONTACT_VIEW") },
    { href: "/admin/invoices", label: "Invoices", show: can(actor, "INVOICE_DRAFT") || can(actor, "FINANCE_VIEW") },
    { href: "/admin/payments", label: "Payments", show: can(actor, "PAYMENT_RECORD") || can(actor, "PAYMENT_VERIFY") },
    { href: "/admin/catalog", label: "Service catalog", show: can(actor, "CATALOG_MANAGE") || can(actor, "PRICE_MANAGE") },
    { href: "/admin/team", label: "Physiotherapists", show: can(actor, "SETTINGS_MANAGE") },
    { href: "/admin/schedule", label: "Hours & holidays", show: can(actor, "SETTINGS_MANAGE") },
    { href: "/admin/staff", label: "Staff & logins", show: can(actor, "USERS_MANAGE") },
    { href: "/admin/security", label: "My security", show: true },
  ].filter((n) => n.show);

  return (
    <div className="min-h-screen bg-[var(--color-surface-alt)] md:grid md:grid-cols-[15rem_1fr]">
      <header className="border-b border-[var(--color-line)] bg-white md:min-h-screen md:border-r md:border-b-0">
        <details className="md:hidden" >
          <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 font-bold">Physio Central admin <span className="text-sm font-normal">Menu</span></summary>
          <AdminNav nav={nav} />
        </details>
        <div className="hidden md:block">
          <p className="px-4 pt-5 pb-3 text-lg font-extrabold text-[var(--color-brand-strong)]">Physio Central</p>
          <AdminNav nav={nav} />
          <div className="px-4 py-4 text-sm">
            <p className="font-semibold">{actor.displayName}</p>
            <p className="text-[var(--color-ink-muted)]">{actor.roles.join(", ").toLowerCase().replace(/_/g, " ")}</p>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="main" className="min-w-0 p-4 sm:p-6 lg:p-8">
        {!mfaOn ? (
          <p className="mb-4 rounded-lg border-l-4 border-[var(--color-warn)] bg-[var(--color-warn-soft)] p-3 text-sm" role="status">
            Two-step verification is not on for your account. <Link href="/admin/security" className="font-semibold">Turn it on now</Link> — required for staff (AUTH-03).
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}

function AdminNav({ nav }: { nav: { href: string; label: string }[] }) {
  return (
    <nav aria-label="Admin">
      <ul className="px-2 pb-2">
        {nav.map((n) => (
          <li key={n.href}>
            <Link href={n.href} className="flex min-h-11 items-center rounded-md px-3 font-medium text-[var(--color-ink)] no-underline hover:bg-[var(--color-brand-soft)]">{n.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
