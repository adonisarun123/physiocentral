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
  if (c.includes("spine") || c.includes("posture")) return "Activity";
  if (c.includes("surg")) return "HeartPulse";
  if (c.includes("ortho") || c.includes("musculo")) return "Bone";
  if (c.includes("strength") || c.includes("function") || c.includes("balance") || c.includes("older")) return "Accessibility";
  if (c.includes("pain") || c.includes("manual")) return "Hand";
  if (c.includes("home")) return "Stethoscope";
  if (c.includes("neuro")) return "Brain";
  return "Activity";
}
