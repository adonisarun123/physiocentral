"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, X, Phone } from "lucide-react";

/** M3 modal navigation drawer: scrim, Escape to close, focus moved in and restored, closes on navigation. */
export function NavDrawer({ items, phone, phoneLabel, header }: { items: { href: string; label: string }[]; phone: string | null; phoneLabel: string | null; header: ReactNode }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closer.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; opener.current?.focus(); };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <button ref={opener} type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="nav-drawer" aria-label="Open menu"
        className="state grid h-12 w-12 place-items-center rounded-full text-[var(--color-ink)] lg:hidden">
        <Menu size={24} aria-hidden="true" />
      </button>
      {open ? (
        <>
          <div className="drawer-scrim" onClick={close} aria-hidden="true" />
          <div id="nav-drawer" role="dialog" aria-modal="true" aria-label="Menu" className="drawer-panel">
            <div className="flex items-center justify-between px-3 pb-4">
              {header}
              <button ref={closer} type="button" onClick={close} aria-label="Close menu" className="state grid h-12 w-12 place-items-center rounded-full text-[var(--color-ink-muted)]"><X size={22} aria-hidden="true" /></button>
            </div>
            <nav aria-label="Main (mobile)">
              <ul>
                <li><Link href="/" className="drawer-item" onClick={close}>Home</Link></li>
                {items.map((n) => <li key={n.href}><Link href={n.href} className="drawer-item" onClick={close}>{n.label}</Link></li>)}
              </ul>
            </nav>
            <div className="mt-4 border-t border-[var(--color-line)] px-3 pt-5">
              <Link href="/book" className="btn btn-primary w-full" onClick={close}>Request appointment</Link>
              {phone ? <a href={phone} className="btn btn-secondary mt-3 w-full"><Phone size={18} aria-hidden="true" /> {phoneLabel}</a> : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
