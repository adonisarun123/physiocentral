/**
 * Area pages (/physiotherapy/[area]) for people searching near HSR Layout.
 *
 * Honesty rules (Google's doorway-page policy, and plain accuracy):
 *  - The clinic is ONLY in Sector 2, HSR Layout. Every page says so up front.
 *  - No travel times or distances: they depend on traffic. Pages link to live
 *    Google Maps directions from the area instead.
 *  - `homeVisits: true` only where the owner has confirmed coverage
 *    (Arun Mahendran, 23 Nov 2026: Sarjapur Road incl. Bellandur/Haralur/
 *    Kaikondrahalli, Electronic City, Koramangala, BTM/Bommanahalli).
 *  - Each page carries its own copy. Don't add an area by copying another's text.
 */
export interface Area {
  slug: string;
  name: string; // as people search it
  /** Directions origin for Google Maps (area name + city). */
  origin: string;
  neighbourhoods: string[];
  homeVisits: boolean;
  title: string; // <title> / H1
  metaDescription: string;
  intro: string;
  /** How people from this area usually reach the clinic. No times, no distances. */
  gettingHere: string[];
  /** Why timing matters for this area, and our suggestion. */
  timing: string;
  /** What people from this area commonly come in with: [condition label, link path]. */
  commonProblems: { label: string; detail: string; href: string }[];
  homeVisitNote: string;
  faqs: { q: string; a: string }[];
}

export const AREAS: Area[] = [
  {
    slug: "sarjapur-road",
    name: "Sarjapur Road",
    origin: "Sarjapur Road, Bengaluru",
    neighbourhoods: ["Kaikondrahalli", "Haralur", "Kasavanahalli", "Carmelaram", "Dommasandra"],
    homeVisits: true,
    title: "Physiotherapy near Sarjapur Road",
    metaDescription: "Physiotherapy for Sarjapur Road residents at Physio Central, HSR Layout, led by orthopaedic surgeon Dr Nitin Sunku. Clinic visits mornings, evenings and Sundays, plus home visits on Sarjapur Road.",
    intro: "Our clinic is in Sector 2, HSR Layout, at the city end of Sarjapur Road. If you live in one of the apartment communities along Sarjapur Road, you can come to the clinic before or after work, or we can come to you with a home visit.",
    gettingHere: [
      "Head towards the city on Sarjapur Road and turn into HSR Layout near Agara.",
      "The clinic is on 24th Main Road, Garden Layout, Sector 2, behind Maramma temple, on the first floor.",
    ],
    timing: "Sarjapur Road traffic peaks on weekday mornings and evenings. Our early-morning and late-evening slots, plus Sunday mornings, are the easiest times to make it in.",
    commonProblems: [
      { label: "Desk-related neck and back pain", detail: "Common among people working long hours in the tech parks and from home.", href: "/blog/desk-job-neck-and-back-pain-hsr-layout" },
      { label: "Knee pain and arthritis", detail: "Painful, stiff knees with walking, stairs or getting up from a chair.", href: "/blog/knee-osteoarthritis-exercise-and-physiotherapy" },
      { label: "Recovery after knee or hip replacement", detail: "Home visits in the first weeks, then clinic sessions once travel is easier.", href: "/services/post-surgical-rehabilitation" },
    ],
    homeVisitNote: "We cover Sarjapur Road and the communities around it, including Kaikondrahalli and Haralur. Home visits are arranged by phone so we can confirm your address, a time and any travel fee before booking.",
    faqs: [
      { q: "Is there a Physio Central clinic on Sarjapur Road?", a: "No. Our only clinic is in Sector 2, HSR Layout, close to the city end of Sarjapur Road. We do offer home visits along Sarjapur Road." },
      { q: "Can my parent have physiotherapy at home on Sarjapur Road?", a: "Yes. Call the clinic and we'll confirm the visit time and any travel fee before booking. Once they're ready, they can switch to clinic sessions." },
      { q: "Can you see me in the first weeks after surgery?", a: "Yes. Many people start with home visits after a joint replacement or fracture surgery and move to the clinic once travel is comfortable." },
    ],
  },
  {
    slug: "electronic-city",
    name: "Electronic City",
    origin: "Electronic City, Bengaluru",
    neighbourhoods: ["Electronic City Phase 1", "Electronic City Phase 2", "Hosa Road", "Neeladri Nagar", "Doddathoguru"],
    homeVisits: true,
    title: "Physiotherapy for Electronic City: home visits and our HSR Layout clinic",
    metaDescription: "Physiotherapy for Electronic City residents: home visits in Electronic City, or one-to-one care at Physio Central in HSR Layout, led by orthopaedic surgeon Dr Nitin Sunku.",
    intro: "We don't have a clinic in Electronic City. Our clinic is in HSR Layout, so for many people in Electronic City the most practical option is a home visit, especially after surgery or for older family members. If you work in the city or pass HSR Layout on your commute, clinic sessions work well too.",
    gettingHere: [
      "Take Hosur Road (or the elevated expressway) towards Silk Board, then turn into HSR Layout.",
      "The clinic is on 24th Main Road, Garden Layout, Sector 2, behind Maramma temple, on the first floor.",
    ],
    timing: "The Hosur Road and Silk Board stretch can be slow at peak hours. If you're coming to the clinic, a Sunday morning slot or an evening slot after the rush is usually easiest. Otherwise, ask about a home visit.",
    commonProblems: [
      { label: "Neck, shoulder and back pain from desk work", detail: "Long shifts and long commutes, often both on the same day.", href: "/blog/desk-job-neck-and-back-pain-hsr-layout" },
      { label: "Sciatica", detail: "Leg pain that gets worse with sitting, including long drives.", href: "/blog/sciatica-symptoms-and-physiotherapy" },
      { label: "Rehab at home after surgery", detail: "When the drive is too much in the early weeks after an operation.", href: "/services/home-visits" },
    ],
    homeVisitNote: "We cover Electronic City Phase 1 and Phase 2 for home visits. They're arranged by phone so we can confirm your address, a time and any travel fee before booking.",
    faqs: [
      { q: "Do you have a clinic in Electronic City?", a: "No. Our only clinic is in Sector 2, HSR Layout. We offer home visits in Electronic City, and you're welcome at the HSR Layout clinic." },
      { q: "Is a home visit or a clinic visit better?", a: "Home visits suit the first weeks after surgery, older adults and anyone for whom travel is hard. Clinic sessions give access to more equipment. Many people start at home and move to the clinic later." },
      { q: "Is there an extra charge for home visits in Electronic City?", a: "A travel fee may apply. We tell you the total before confirming the visit." },
    ],
  },
  {
    slug: "koramangala",
    name: "Koramangala",
    origin: "Koramangala, Bengaluru",
    neighbourhoods: ["Koramangala 1st Block", "Koramangala 3rd Block", "Koramangala 5th Block", "Koramangala 6th Block", "Koramangala 8th Block", "Venkatapura"],
    homeVisits: true,
    title: "Physiotherapy near Koramangala",
    metaDescription: "Physiotherapy near Koramangala at Physio Central, HSR Layout: sports injuries, back and neck pain and rehab after surgery, led by orthopaedic surgeon Dr Nitin Sunku. Home visits in Koramangala too.",
    intro: "Koramangala sits right next to HSR Layout, so our Sector 2 clinic is a short trip for most of Koramangala. It's a practical choice whether you're managing a gym or running injury, a desk-work niggle, or recovery after surgery.",
    gettingHere: [
      "From Koramangala, head south-east into HSR Layout towards Sector 2.",
      "The clinic is on 24th Main Road, Garden Layout, Sector 2, behind Maramma temple, on the first floor.",
    ],
    timing: "Being so close, you can usually fit a session around the workday. Early-morning and late-evening slots fill first, so book a few days ahead if you need one.",
    commonProblems: [
      { label: "Gym and sports injuries", detail: "Strains, sprains and niggles from lifting, football, badminton and running.", href: "/services/sports-injury-rehabilitation" },
      { label: "Running injuries", detail: "Runner's knee, shin splints and Achilles pain from building mileage too fast.", href: "/blog/common-running-injuries-hsr-layout-runners" },
      { label: "Rehab after ACL reconstruction", detail: "Milestone-based rehab with a sports-medicine surgeon leading clinical care.", href: "/blog/acl-reconstruction-recovery-timeline" },
    ],
    homeVisitNote: "We cover Koramangala for home visits, useful after surgery or for older family members. They're arranged by phone so we can confirm your address, a time and any travel fee before booking.",
    faqs: [
      { q: "Is Physio Central in Koramangala?", a: "Our clinic is in Sector 2, HSR Layout, right next to Koramangala. We also offer home visits in Koramangala." },
      { q: "Do you treat sports injuries?", a: "Yes. Clinical care is led by Dr Nitin Sunku, an orthopaedic and sports-medicine surgeon and Team Doctor for Bengaluru FC." },
      { q: "How long is a session?", a: "Treatment sessions are one-to-one with a physiotherapist. Your first visit is a full assessment." },
    ],
  },
  {
    slug: "bellandur",
    name: "Bellandur & Outer Ring Road",
    origin: "Bellandur, Bengaluru",
    neighbourhoods: ["Bellandur", "Ibblur", "Agara", "Devarabeesanahalli", "Kadubeesanahalli"],
    homeVisits: true,
    title: "Physiotherapy near Bellandur and the Outer Ring Road",
    metaDescription: "Physiotherapy for Bellandur and Outer Ring Road tech corridor professionals at Physio Central, HSR Layout. Before-work and after-work slots, Sundays, and home visits. Led by Dr Nitin Sunku.",
    intro: "If you work on the Outer Ring Road or live in Bellandur, our clinic in Sector 2, HSR Layout is close by, just off the ORR near Agara. Early-morning and late-evening appointments mean you can come before or after the office.",
    gettingHere: [
      "From Bellandur, take the Outer Ring Road towards Agara and Ibblur, then turn into HSR Layout.",
      "The clinic is on 24th Main Road, Garden Layout, Sector 2, behind Maramma temple, on the first floor.",
    ],
    timing: "The ORR is busiest at office hours. An early slot before work or a late one on the way home usually avoids the worst of it. Sunday mornings are open too.",
    commonProblems: [
      { label: "Neck and back pain from long workdays", detail: "Hours at a desk plus a daily commute.", href: "/blog/desk-job-neck-and-back-pain-hsr-layout" },
      { label: "Wrist, elbow and shoulder pain", detail: "Aches that build up with heavy keyboard and mouse use.", href: "/services/orthopaedic-physiotherapy" },
      { label: "Getting back to exercise", detail: "Rebuilding strength and fitness safely after time off or an injury.", href: "/services/strengthening-and-functional-training" },
    ],
    homeVisitNote: "We cover Bellandur for home visits. They're arranged by phone so we can confirm your address, a time and any travel fee before booking.",
    faqs: [
      { q: "Is there a clinic on the Outer Ring Road?", a: "Our only clinic is in Sector 2, HSR Layout, close to the ORR near Agara. We also offer home visits in Bellandur." },
      { q: "Can I come before or after work?", a: "Yes. We have early-morning and late-evening slots Monday to Saturday, plus Sunday mornings. See the opening hours on this page." },
      { q: "Can I book online?", a: "Yes. Request a time online in about two minutes and we'll confirm it with you." },
    ],
  },
  {
    slug: "btm-layout",
    name: "BTM Layout & Bommanahalli",
    origin: "BTM Layout, Bengaluru",
    neighbourhoods: ["BTM Layout 1st Stage", "BTM Layout 2nd Stage", "Bommanahalli", "Madiwala", "Hongasandra"],
    homeVisits: true,
    title: "Physiotherapy near BTM Layout and Bommanahalli",
    metaDescription: "Physiotherapy near BTM Layout and Bommanahalli at Physio Central, HSR Layout, led by orthopaedic surgeon Dr Nitin Sunku. Back pain, joint pain, sports injuries, post-surgery rehab and home visits.",
    intro: "BTM Layout and Bommanahalli are neighbours of HSR Layout, on the Silk Board side. Our clinic in Sector 2, HSR Layout is the nearest Physio Central location, and we also visit patients at home in BTM Layout and Bommanahalli.",
    gettingHere: [
      "From BTM Layout or Bommanahalli, cross towards HSR Layout and head for Sector 2.",
      "The clinic is on 24th Main Road, Garden Layout, Sector 2, behind Maramma temple, on the first floor.",
    ],
    timing: "Silk Board junction is notoriously slow at peak hours. An early-morning weekday slot or a Sunday morning is usually the easiest time to come in.",
    commonProblems: [
      { label: "Lower back pain", detail: "From desk work, lifting and long hours on a two-wheeler.", href: "/blog/lower-back-pain-when-to-see-a-physio" },
      { label: "Heel and foot pain", detail: "Including plantar fasciitis in people who stand or walk a lot.", href: "/blog/plantar-fasciitis-heel-pain" },
      { label: "Frozen shoulder", detail: "Painful, progressive shoulder stiffness, treated stage by stage.", href: "/blog/frozen-shoulder-stages-and-treatment" },
    ],
    homeVisitNote: "We cover BTM Layout and Bommanahalli for home visits. They're arranged by phone so we can confirm your address, a time and any travel fee before booking.",
    faqs: [
      { q: "Is Physio Central in BTM Layout?", a: "No. Our only clinic is in Sector 2, HSR Layout, next to BTM Layout and Bommanahalli. We do offer home visits in both areas." },
      { q: "What if I need a doctor's opinion?", a: "Every new problem starts with an assessment. If you need an orthopaedic opinion, your physiotherapist can refer you to Dr Nitin Sunku's practice, with your notes going along." },
      { q: "What will it cost?", a: "Our fees and treatment packages are published on the pricing page, and you get an itemised estimate before treatment starts." },
    ],
  },
];

export function getArea(slug: string) {
  return AREAS.find((a) => a.slug === slug) ?? null;
}
