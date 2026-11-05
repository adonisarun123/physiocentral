"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Google Analytics 4 (gtag.js). Mounted from the public layout only, so staff
// /admin screens are never tracked. /manage/[token] lives under the public layout
// but its URL carries a patient's secret link token, so GA is switched off there
// (including after client-side navigation) to keep the token out of Google.
// CSP origins for these scripts are allow-listed in next.config.ts.
export const GA_MEASUREMENT_ID = "G-N2B8V32HC6";
const DISABLE_FLAG = `ga-disable-${GA_MEASUREMENT_ID}`;

const isPrivatePath = (p: string | null) => !!p && p.startsWith("/manage");

export function GoogleAnalytics() {
  const pathname = usePathname();
  const blocked = isPrivatePath(pathname);

  useEffect(() => {
    (window as unknown as Record<string, unknown>)[DISABLE_FLAG] = blocked;
  }, [blocked]);

  return (
    <>
      <Script id="ga4-init" strategy="afterInteractive">
        {`if (location.pathname.indexOf('/manage') === 0) { window['${DISABLE_FLAG}'] = true; }
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}', { allow_google_signals: false, allow_ad_personalization_signals: false });`}
      </Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
    </>
  );
}
