/**
 * "Where does it hurt?" entry points — aligned with the services on the
 * clinic's own signage (Physio Central, HSR Layout). Non-diagnostic; every
 * tile leads to an assessment request.
 */
export const BODY_AREAS = [
  { key: "spine", label: "Neck, back & sciatica", examples: "Neck pain, back pain, sciatica and posture-related strain", icon: "Activity" },
  { key: "joints", label: "Joint pain & arthritis", examples: "Painful, stiff joints and arthritis", icon: "Bone" },
  { key: "fracture", label: "After a fracture", examples: "Regaining movement and strength after a fracture", icon: "Bone" },
  { key: "surgery", label: "After surgery", examples: "Knee or hip replacement (TKR, THR) and arthroscopy rehab", icon: "HeartPulse" },
  { key: "sports", label: "Sports injuries", examples: "Ligament and muscle injuries, getting back to activity", icon: "Dumbbell" },
  { key: "knee", label: "Knee & hip", examples: "Knee and hip pain, stiffness and weakness", icon: "Footprints" },
  { key: "balance", label: "Mobility & balance", examples: "Strength, flexibility, balance and everyday function", icon: "Accessibility" },
  { key: "home", label: "Care at home", examples: "Personalised physiotherapy at home when travelling is hard", icon: "Stethoscope" },
] as const;
