"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Progressive scroll-reveal. Content is fully visible without JS; once mounted
 * this opts the page in (adds .reveal-ready) and fades [data-reveal] elements
 * in as they enter the viewport. CSS disables it for reduced-motion users.
 *
 * Lives in the shared layout, which does NOT remount on client-side navigation.
 * So it re-scans on every pathname change and also watches the DOM for
 * [data-reveal] nodes added later (streamed/suspended content). Without this,
 * pages reached via a <Link> stayed at opacity:0 and looked blank.
 */
export function RevealRoot() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("reveal-ready");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            el.style.transitionDelay = `${Number(el.dataset.reveal || 0)}ms`;
            el.classList.add("is-in");
            io.unobserve(el);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    const observeWithin = (root: ParentNode) => {
      if (root instanceof HTMLElement && root.matches("[data-reveal]:not(.is-in)")) io.observe(root);
      root.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)").forEach((el) => io.observe(el));
    };
    observeWithin(document);

    const mo = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => { if (n instanceof HTMLElement) observeWithin(n); });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => { io.disconnect(); mo.disconnect(); };
  }, [pathname]);

  return null;
}
