/**
 * "Where does it hurt?" entry points — aligned with the services on the
 * clinic's own signage (Physio Central, HSR Layout). Non-diagnostic; every
 * tile leads to an assessment request. `service` is the public service slug
 * the area points to (homepage chips link to that service page).
 */
export const BODY_AREAS = [
  { key: "spine", service: "spine-and-posture-care", label: "Neck, back & sciatica", examples: "Neck pain, back pain, sciatica and posture-related strain", icon: "Activity" },
  { key: "joints", service: "orthopaedic-physiotherapy", label: "Joint pain & arthritis", examples: "Painful, stiff joints and arthritis", icon: "Bone" },
  { key: "fracture", service: "orthopaedic-physiotherapy", label: "After a fracture", examples: "Regaining movement and strength after a fracture", icon: "Bone" },
  { key: "surgery", service: "post-surgical-rehabilitation", label: "After surgery", examples: "Knee or hip replacement (TKR, THR) and arthroscopy rehab", icon: "HeartPulse" },
  { key: "sports", service: "sports-injury-rehabilitation", label: "Sports injuries", examples: "Ligament and muscle injuries, getting back to activity", icon: "Dumbbell" },
  { key: "knee", service: "orthopaedic-physiotherapy", label: "Knee & hip", examples: "Knee and hip pain, stiffness and weakness", icon: "Footprints" },
  { key: "balance", service: "strengthening-and-functional-training", label: "Mobility & balance", examples: "Strength, flexibility, balance and everyday function", icon: "Accessibility" },
  { key: "home", service: "home-visits", label: "Care at home", examples: "Personalised physiotherapy at home when travelling is hard", icon: "Stethoscope" },
] as const;
