/**
 * "Where does it hurt?" entry points (pattern from physiotattva.com).
 * General, non-diagnostic descriptions of common reasons people see a
 * physiotherapist. Every tile leads to an assessment request, not a diagnosis.
 * Clinic should review wording before launch (§3.2).
 */
export const BODY_AREAS = [
  { key: "back", label: "Back & spine", examples: "Lower back pain, stiffness, pain spreading to the leg", icon: "Activity" },
  { key: "neck", label: "Neck & shoulder", examples: "Neck pain, stiff or painful shoulder, desk-posture strain", icon: "PersonStanding" },
  { key: "knee", label: "Knee & hip", examples: "Knee pain, hip pain, recovery after joint surgery", icon: "Footprints" },
  { key: "foot", label: "Foot & ankle", examples: "Heel pain, ankle sprains, Achilles pain", icon: "Footprints" },
  { key: "sports", label: "Sports injuries", examples: "Muscle strains, ligament injuries, return to sport", icon: "Dumbbell" },
  { key: "neuro", label: "Neurological", examples: "Rehabilitation after stroke and other nerve conditions", icon: "Brain" },
  { key: "hand", label: "Hand & elbow", examples: "Tennis elbow, wrist pain, hand stiffness", icon: "Hand" },
  { key: "balance", label: "Balance & mobility", examples: "Unsteadiness, falls, getting stronger with age", icon: "Accessibility" },
] as const;
