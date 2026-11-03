import { Activity, Accessibility, Brain, Dumbbell, Footprints, Hand, PersonStanding, Stethoscope, HeartPulse, Bone, type LucideProps } from "lucide-react";

const ICONS = { Activity, Accessibility, Brain, Dumbbell, Footprints, Hand, PersonStanding, Stethoscope, HeartPulse, Bone };
export type IconName = keyof typeof ICONS;

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const C = ICONS[name as IconName] ?? Stethoscope;
  return <C aria-hidden="true" {...props} />;
}

/** Pick an icon for a catalog category name. */
export function iconForCategory(category: string | null): IconName {
  const c = (category ?? "").toLowerCase();
  if (c.includes("sport")) return "Dumbbell";
  if (c.includes("neuro")) return "Brain";
  if (c.includes("older") || c.includes("balance")) return "Accessibility";
  if (c.includes("musculo") || c.includes("post")) return "Bone";
  if (c.includes("assess")) return "Stethoscope";
  if (c.includes("home")) return "HeartPulse";
  return "Activity";
}
