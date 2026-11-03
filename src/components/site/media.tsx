import { Icon, type IconName } from "./icon";

const TONES = ["secondary", "tertiary", "primary"] as const;

/**
 * Media slot for a service/story card. Shows a tonal brand panel with the
 * service icon until real photography is supplied (pass `src` then).
 */
export function MediaPanel({ icon, index = 0, className = "", src, alt = "" }: { icon: IconName; index?: number; className?: string; src?: string; alt?: string }) {
  const tone = TONES[index % 3];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={`h-full w-full object-cover ${className}`} />;
  }
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
