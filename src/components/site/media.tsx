import Image from "next/image";
import { Icon, type IconName } from "./icon";

const TONES = ["secondary", "tertiary", "primary"] as const;

/**
 * Temporary licensed stock photos (see public/images/stock/CREDITS.md), keyed by
 * service slug. Replace with real clinic photography when available.
 */
const STOCK: [RegExp, string][] = [
  [/assess/, "/images/stock/assess.webp"],
  [/post-?surg/, "/images/stock/postsurg.webp"],
  [/sport/, "/images/stock/sports.webp"],
  [/spine|posture|back|neck/, "/images/stock/spine.webp"],
  [/strength|functional|balance/, "/images/stock/strength.webp"],
  [/pain|manual/, "/images/stock/pain.webp"],
  [/home/, "/images/stock/home.webp"],
  [/ortho/, "/images/stock/ortho.webp"],
];

export function serviceImage(slug: string): string | undefined {
  return STOCK.find(([re]) => re.test(slug))?.[1];
}

/**
 * Media slot: a photo when one exists, otherwise a tonal brand panel with the
 * service icon. Images are decorative next to their headings (alt="") unless
 * an alt is given.
 */
export function MediaPanel({ icon, index = 0, className = "", src, alt = "", sizes = "(min-width: 768px) 33vw, 100vw", priority = false }:
  { icon: IconName; index?: number; className?: string; src?: string; alt?: string; sizes?: string; priority?: boolean }) {
  if (src) {
    return (
      <div className={`relative overflow-hidden bg-[var(--md-sys-color-surface-container-high)] ${className}`}>
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  const tone = TONES[index % 3];
  return (
    <div aria-hidden="true" className={`relative grid place-items-center overflow-hidden ${className}`}
      style={{ background: `var(--md-sys-color-${tone}-container)`, color: `var(--md-sys-color-on-${tone}-container)` }}>
      <svg className="absolute inset-0 h-full w-full opacity-40" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" fill="none">
        {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M-10 ${190 - i * 30} C110 ${140 - i * 30} 200 ${220 - i * 30} 300 ${170 - i * 30} S380 ${130 - i * 30} 420 ${150 - i * 30}`} stroke="currentColor" strokeOpacity={0.35} />)}
      </svg>
      <Icon name={icon} size={56} strokeWidth={1.4} />
    </div>
  );
}
