import { ArrowUpRight, Stethoscope } from "lucide-react";

/**
 * Dr Nitin Sunku's orthopaedic practice. Facts below are taken from his own
 * site (drnitinsunkuortho.com, checked 2026-11-03). Update there first, then here.
 */
export const ORTHO = {
  url: "https://drnitinsunkuortho.com/",
  contactUrl: "https://drnitinsunkuortho.com/contact",
  name: "Dr Nitin N Sunku",
  credentials: "MBBS, MS Orthopaedics (Gold Medalist) · Fellowship in Arthroscopy & Sports Medicine",
  registration: "Karnataka Medical Council Reg. No. 117608",
  phone: "+91 99800 31006",
  phoneHref: "tel:+919980031006",
} as const;

const linkProps = { target: "_blank", rel: "noopener" } as const;

/** Site-wide band: routes orthopaedic / surgical queries to Dr Sunku's practice. */
export function OrthoReferralBand() {
  return (
    <section aria-labelledby="ortho-h" className="border-t border-[var(--color-line)] bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]">
      <div className="wrap flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--md-sys-shape-lg)] bg-[var(--md-sys-color-surface)]">
            <Stethoscope size={24} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <div>
            <h2 id="ortho-h" className="title-large">Need an orthopaedic opinion or surgery?</h2>
            <p className="body-medium mt-1 max-w-2xl">
              For fractures, ACL and meniscus injuries, arthroscopy, knee or hip replacement, injections and other orthopaedic
              care, consult {ORTHO.name}, orthopaedic and sports-medicine surgeon.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <a href={ORTHO.url} {...linkProps} className="btn btn-primary">Visit orthopaedic clinic <ArrowUpRight size={16} aria-hidden="true" /></a>
          <a href={ORTHO.phoneHref} className="btn btn-secondary">Call {ORTHO.phone}</a>
        </div>
      </div>
    </section>
  );
}
