/**
 * "Conditions we treat" hub (/conditions). Plain-language, non-diagnostic.
 * Each condition points to the service that treats it and, where one exists,
 * the guide that explains it. `service` must be a public service slug and
 * `guide` an existing blog slug (checked in tests/unit/link-map.test.ts).
 */
export interface Condition {
  name: string;
  summary: string;
  service: string;
  guide?: string;
}

export interface ConditionGroup {
  key: string;
  title: string;
  icon: "Activity" | "Bone" | "HeartPulse" | "Dumbbell" | "Footprints" | "Accessibility";
  conditions: Condition[];
}

export const CONDITION_GROUPS: ConditionGroup[] = [
  {
    key: "back-neck",
    title: "Back & neck",
    icon: "Activity",
    conditions: [
      { name: "Lower back pain", summary: "Acute or recurring back pain, including stiffness after sitting or lifting.", service: "spine-and-posture-care", guide: "lower-back-pain-when-to-see-a-physio" },
      { name: "Sciatica", summary: "Pain, tingling or numbness travelling from the back into the leg.", service: "spine-and-posture-care", guide: "sciatica-symptoms-and-physiotherapy" },
      { name: "Neck pain & desk-related strain", summary: "Neck, shoulder and upper-back pain from long hours at a screen.", service: "spine-and-posture-care", guide: "desk-job-neck-and-back-pain-hsr-layout" },
      { name: "Posture-related pain", summary: "Aches that build through the day with sitting, standing or carrying.", service: "spine-and-posture-care" },
    ],
  },
  {
    key: "shoulder-arm",
    title: "Shoulder & arm",
    icon: "Bone",
    conditions: [
      { name: "Frozen shoulder", summary: "Painful, progressive stiffness of the shoulder that limits everyday reaching.", service: "orthopaedic-physiotherapy", guide: "frozen-shoulder-stages-and-treatment" },
      { name: "Shoulder pain & stiffness", summary: "Pain lifting the arm, reaching behind or sleeping on the shoulder.", service: "orthopaedic-physiotherapy" },
      { name: "Recovery after a fracture", summary: "Regaining movement and strength once a fracture has healed enough to move.", service: "orthopaedic-physiotherapy" },
    ],
  },
  {
    key: "knee-hip",
    title: "Knee & hip",
    icon: "Footprints",
    conditions: [
      { name: "Knee osteoarthritis", summary: "Painful, stiff knees with walking, stairs or getting up from a chair.", service: "orthopaedic-physiotherapy", guide: "knee-osteoarthritis-exercise-and-physiotherapy" },
      { name: "Runner's knee", summary: "Pain around the kneecap with running, stairs, squatting or sitting.", service: "sports-injury-rehabilitation", guide: "common-running-injuries-hsr-layout-runners" },
      { name: "Hip pain & stiffness", summary: "Pain in the hip or groin with walking, stairs or sitting cross-legged.", service: "orthopaedic-physiotherapy" },
    ],
  },
  {
    key: "foot-ankle",
    title: "Foot & ankle",
    icon: "Footprints",
    conditions: [
      { name: "Ankle sprain", summary: "Rolled ankles, from first-day care to balance work and return to sport.", service: "sports-injury-rehabilitation", guide: "sprained-ankle-rehab" },
      { name: "Plantar fasciitis (heel pain)", summary: "Sharp heel pain with the first steps in the morning.", service: "orthopaedic-physiotherapy", guide: "plantar-fasciitis-heel-pain" },
      { name: "Achilles & shin pain", summary: "Running-related pain at the back of the heel or along the shin.", service: "sports-injury-rehabilitation", guide: "common-running-injuries-hsr-layout-runners" },
    ],
  },
  {
    key: "surgery",
    title: "Before & after surgery",
    icon: "HeartPulse",
    conditions: [
      { name: "Knee replacement (TKR)", summary: "Week-by-week rehab to bend, straighten, walk and climb stairs again.", service: "post-surgical-rehabilitation", guide: "physiotherapy-after-knee-replacement" },
      { name: "Hip replacement (THR)", summary: "Rehab after hip replacement, following your surgeon's precautions.", service: "post-surgical-rehabilitation" },
      { name: "ACL reconstruction", summary: "Milestone-based rehab from the first week to return to sport.", service: "post-surgical-rehabilitation", guide: "acl-reconstruction-recovery-timeline" },
      { name: "Arthroscopy rehab", summary: "Recovery after keyhole surgery on the knee or shoulder.", service: "post-surgical-rehabilitation" },
    ],
  },
  {
    key: "sport-strength",
    title: "Sport, strength & mobility",
    icon: "Dumbbell",
    conditions: [
      { name: "Ligament & muscle injuries", summary: "Sprains and strains, and getting back to training safely.", service: "sports-injury-rehabilitation" },
      { name: "Returning to exercise", summary: "Rebuilding strength and confidence after injury or time off.", service: "strengthening-and-functional-training" },
      { name: "Balance problems & falls risk", summary: "Strength and balance work for steadier walking, in clinic or at home.", service: "strengthening-and-functional-training", guide: "home-physiotherapy-for-elderly-parents" },
    ],
  },
];
