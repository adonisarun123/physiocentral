"use client";

import { useEffect } from "react";

/**
 * Progressive scroll-reveal. Content is fully visible without JS; once mounted
 * this opts the page in (adds .reveal-ready) and fades [data-reveal] elements
 * in as they enter the viewport. CSS disables it for reduced-motion users.
 */
export function RevealRoot() {
  useEffect(() => {
    const root = document.documentElement;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) return;
    root.classList.add("reveal-ready");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const delay = Number((e.target as HTMLElement).dataset.reveal || 0);
            (e.target as HTMLElement).style.transitionDelay = `${delay}ms`;
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
