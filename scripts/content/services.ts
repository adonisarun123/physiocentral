/**
 * Public service content for Physio Central by Dr Nitin Sunku (HSR Layout).
 * Scope comes from the clinic's own signage (2026-11-03). Copy is general,
 * non-diagnostic patient education with no outcome guarantees (§3.2, §14.4).
 * content_status = IN_REVIEW until Dr Nitin Sunku approves the wording.
 */
export interface ServiceContent {
  code: string;
  slug: string;
  name: string;
  categorySlug: string;
  bookable: boolean;
  durationMinutes: number;
  billingUnit: string;
  sortOrder: number;
  headline: string;
  summary: string;
  body: string;
  conditions: string[];
  whoItMayHelp: string;
  whatToExpect: string;
  limitations: string;
  steps: { title: string; body: string }[];
  faqs: { q: string; a: string }[];
  seoTitle: string;
  seoDescription: string;
}

const SEEK_URGENT =
  "Seek urgent medical care (call 112 or go to an emergency department) for severe or sudden pain after a fall or accident, numbness in the groin or saddle area, new loss of bladder or bowel control, rapidly worsening weakness, chest pain, fever with back pain, or a calf that is hot, red and swollen.";

export const SERVICES: ServiceContent[] = [
  {
    code: "PC-ASSESS",
    slug: "initial-physiotherapy-assessment",
    name: "Initial Physiotherapy Assessment",
    categorySlug: "assessment",
    bookable: true,
    durationMinutes: 60,
    billingUnit: "Visit",
    sortOrder: 0,
    headline: "Not sure what you need? Start here.",
    summary: "A thorough first visit to understand your pain or injury, how you move and what you want to get back to — ending with a clear, agreed plan.",
    body:
      "Most people come to us with a problem rather than a diagnosis: a knee that aches on the stairs, a back that stiffens after a long day at the desk, a shoulder that hasn't been right since a fall. The initial assessment is designed for exactly that.\n\n" +
      "We take time to listen to your story, look at how you move and test the areas involved. By the end you should understand what is likely driving your symptoms, what treatment we recommend, how many sessions it may take, and what you can start doing at home. If anything suggests you need a scan or a doctor's opinion first, we will tell you.",
    conditions: ["New or ongoing pain", "Stiffness or reduced movement", "Weakness or instability", "Recovery after injury", "Before or after surgery", "Not sure which service you need"],
    whoItMayHelp: "Anyone visiting Physio Central for the first time, or returning with a new problem.",
    whatToExpect: "A conversation about your history and goals, a movement and strength examination, a plain-language explanation, and a written plan with an estimate you approve before treatment starts.",
    limitations: "An assessment is not an emergency service. " + SEEK_URGENT,
    steps: [
      { title: "Your story", body: "When it started, what makes it better or worse, your work, sport and daily routine, and any previous treatment or reports." },
      { title: "Movement & strength tests", body: "We examine how the area moves, where strength or control is lacking, and how it affects everyday tasks." },
      { title: "What's going on", body: "We explain our findings in plain words and answer your questions." },
      { title: "Your plan & estimate", body: "An agreed treatment plan, home exercises to start with, and an itemised estimate for you to approve." },
    ],
    faqs: [
      { q: "What should I bring?", a: "Any recent scans, reports or discharge notes, a list of medicines you take, and comfortable clothing that lets us see and move the area being assessed." },
      { q: "Do I need a doctor's referral?", a: "You don't need one to book. If you already have a referral or surgeon's instructions, please bring them so we can follow them." },
      { q: "Will I get treatment on the first visit?", a: "Often yes — where it's appropriate, we begin treatment and home exercises in the same session once you've agreed the plan." },
    ],
    seoTitle: "Physiotherapy Assessment in HSR Layout",
    seoDescription: "Book a 60-minute physiotherapy assessment at Physio Central by Dr Nitin Sunku, HSR Layout, Bengaluru. Clear findings, an agreed plan and costs approved upfront.",
  },
  {
    code: "PC-ORTHO",
    slug: "orthopaedic-physiotherapy",
    name: "Orthopaedic Physiotherapy",
    categorySlug: "orthopaedic",
    bookable: true,
    durationMinutes: 45,
    billingUnit: "Session",
    sortOrder: 1,
    headline: "Physiotherapy for joint pain, arthritis and fractures.",
    summary: "Hands-on treatment and guided exercise to ease joint pain, manage arthritis and rebuild movement and strength after a fracture.",
    body:
      "Orthopaedic physiotherapy looks after the bones, joints, muscles and ligaments that let you move. Whether it's a painful knee, a stiff shoulder, arthritis that's limiting your walks or the weeks after a plaster comes off, the aim is the same: less pain, more movement and the confidence to get back to normal life.\n\n" +
      "Treatment combines skilled hands-on techniques with a progressive exercise programme built around your goals. For arthritis, we focus on keeping joints moving and muscles strong, and on practical ways to manage flare-ups. After a fracture, we work within your doctor's guidance to restore range of motion, strength and function step by step.",
    conditions: ["Knee pain", "Hip pain", "Shoulder pain and stiffness", "Osteoarthritis", "Recovery after a fracture", "Elbow, wrist and hand pain", "Ankle and foot pain", "Tendon pain"],
    whoItMayHelp: "Adults with joint or muscle pain, arthritis, or stiffness and weakness after a fracture.",
    whatToExpect: "Sessions usually combine hands-on techniques, targeted exercises and advice. You'll get a home programme so progress continues between visits.",
    limitations: "Physiotherapy complements medical care; it doesn't replace it. For fractures, we follow your orthopaedic doctor's restrictions on weight-bearing and movement. " + SEEK_URGENT,
    steps: [
      { title: "Assess", body: "We examine the joint, surrounding muscles and how the problem affects daily tasks." },
      { title: "Relieve", body: "Hands-on techniques and other options to ease pain and stiffness so you can move more comfortably." },
      { title: "Strengthen", body: "Progressive exercises to restore strength, control and range of motion." },
      { title: "Return", body: "Practising the activities that matter to you — stairs, walking, lifting, work or sport." },
    ],
    faqs: [
      { q: "Can physiotherapy help arthritis?", a: "Exercise and physiotherapy are widely recommended to help people with arthritis manage pain and stay active. They won't reverse joint changes, but many people find they can do more with less pain." },
      { q: "When can I start physio after a fracture?", a: "That depends on the fracture and how it was treated. We follow your doctor's guidance — bring your discharge notes or X-ray report to your first visit." },
      { q: "How many sessions will I need?", a: "It varies with the problem and your goals. After your assessment we'll give you an honest estimate and review it as you progress." },
    ],
    seoTitle: "Orthopaedic Physiotherapy in HSR Layout — Joint Pain, Arthritis & Fractures",
    seoDescription: "Physiotherapy for knee, hip and shoulder pain, arthritis and fracture recovery at Physio Central by Dr Nitin Sunku, HSR Layout, Bengaluru.",
  },
  {
    code: "PC-POSTSURG",
    slug: "post-surgical-rehabilitation",
    name: "Post-surgical Rehabilitation",
    categorySlug: "post-surgical",
    bookable: true,
    durationMinutes: 45,
    billingUnit: "Session",
    sortOrder: 2,
    headline: "Structured rehab after TKR, THR and arthroscopy.",
    summary: "Step-by-step rehabilitation after knee replacement (TKR), hip replacement (THR) and arthroscopic surgery, guided by your surgeon's protocol.",
    body:
      "Surgery is only part of the journey. What happens in the weeks and months afterwards has a big influence on how well you move, how confident you feel and how soon you return to everyday life.\n\n" +
      "We design your rehabilitation around your surgeon's protocol and your stage of recovery. Early on, the focus is on safely managing pain and swelling, getting the joint moving and walking well with or without aids. As healing progresses, we build strength, balance and endurance, and practise real-life tasks like stairs, getting in and out of a car, and returning to work or sport.",
    conditions: ["Total knee replacement (TKR)", "Total hip replacement (THR)", "Knee arthroscopy", "Shoulder arthroscopy", "Ligament reconstruction", "Other orthopaedic surgery"],
    whoItMayHelp: "Anyone recovering from orthopaedic surgery, including joint replacement and arthroscopy — and people preparing for surgery who want to start strong.",
    whatToExpect: "We review your surgical notes and restrictions, then progress you through clear stages: movement, walking, strength, balance and function. Home exercises are a key part of the plan.",
    limitations: "We follow your surgeon's instructions. Contact your surgeon promptly if your wound becomes red, hot, swollen or starts to discharge, if you develop a fever, or if your calf becomes painful and swollen. " + SEEK_URGENT,
    steps: [
      { title: "Protect & move", body: "Manage pain and swelling, start gentle movement and safe walking within your surgeon's limits." },
      { title: "Restore range", body: "Regain the bend and straightening of the joint needed for everyday activities." },
      { title: "Build strength", body: "Progressive strengthening and balance work so the joint feels stable and reliable." },
      { title: "Get back to life", body: "Stairs, longer walks, work tasks and, where appropriate, sport or recreation." },
    ],
    faqs: [
      { q: "When should I start physio after knee or hip replacement?", a: "Usually as soon as your surgeon advises — often within days of discharge. Bring your discharge summary so we can follow your surgeon's protocol." },
      { q: "Can you help before my surgery?", a: "Yes. Strengthening and learning your exercises before surgery (sometimes called 'prehab') can make the early recovery period easier." },
      { q: "Can rehab be done at home?", a: "In the early weeks, travelling can be hard. Ask us about home visits — see our Home Visits service." },
    ],
    seoTitle: "Post-surgery Rehab in HSR Layout — Knee & Hip Replacement, Arthroscopy",
    seoDescription: "Rehabilitation after TKR, THR and arthroscopy at Physio Central by Dr Nitin Sunku, HSR Layout, Bengaluru. Staged recovery following your surgeon's protocol.",
  },
  {
    code: "PC-SPORTS",
    slug: "sports-injury-rehabilitation",
    name: "Sports Injury Rehabilitation",
    categorySlug: "sports-rehab",
    bookable: true,
    durationMinutes: 45,
    billingUnit: "Session",
    sortOrder: 3,
    headline: "Back to sport — stronger and with confidence.",
    summary: "Rehabilitation for ligament and muscle injuries, from the first days after injury to a structured return to your sport.",
    body:
      "Sports injuries are frustrating — especially when they keep coming back. Good rehabilitation doesn't stop when the pain settles; it rebuilds the strength, control and confidence you need for the demands of your sport.\n\n" +
      "We start by understanding the injury and the sport you want to return to. Treatment then moves through clear stages, from settling the injury and restoring movement to strength, power, agility and sport-specific drills. Return-to-sport decisions are based on how you're actually performing, not just on how many weeks have passed.",
    conditions: ["Ankle sprains", "Knee ligament injuries (e.g. ACL, MCL)", "Hamstring and calf strains", "Groin strains", "Shoulder injuries in overhead sports", "Tendon pain from training load", "Runner's knee and shin pain"],
    whoItMayHelp: "Recreational and competitive athletes, runners, gym-goers and anyone injured while being active.",
    whatToExpect: "An assessment of the injury and your sport, then a progressive programme with clear milestones and advice on managing training load.",
    limitations: "Some injuries need imaging or a specialist opinion first — we'll tell you if so. Seek urgent care for a suspected fracture, dislocation, a joint that locks or gives way badly, or a head injury.",
    steps: [
      { title: "Settle", body: "Calm the injury and protect healing tissue while keeping you as active as is safe." },
      { title: "Restore", body: "Regain full movement and basic strength around the injured area." },
      { title: "Rebuild", body: "Progressive strength, power, balance and agility work tailored to your sport." },
      { title: "Return", body: "Sport-specific drills and a planned return to training and competition." },
    ],
    faqs: [
      { q: "Should I rest completely after a sports injury?", a: "Usually not for long. Short-term protection helps, but guided movement and loading generally support recovery. We'll tell you what's safe for your injury." },
      { q: "How do I know I'm ready to return?", a: "We use practical tests of strength, movement and sport-specific tasks — alongside how confident you feel — rather than time alone." },
      { q: "Can you help me avoid getting injured again?", a: "Yes. We look at strength gaps, movement patterns and training load, and give you a plan to keep building after discharge." },
    ],
    seoTitle: "Sports Injury Physiotherapy in HSR Layout — Ligament & Muscle Injuries",
    seoDescription: "Sports injury rehab for sprains, ligament and muscle injuries at Physio Central by Dr Nitin Sunku, HSR Layout, Bengaluru. Staged return to sport.",
  },
  {
    code: "PC-SPINE",
    slug: "spine-and-posture-care",
    name: "Spine & Posture Care",
    categorySlug: "spine-posture",
    bookable: true,
    durationMinutes: 45,
    billingUnit: "Session",
    sortOrder: 4,
    headline: "Relief for neck pain, back pain and sciatica.",
    summary: "Assessment and treatment for neck pain, back pain and sciatica, with practical posture and movement advice for work and home.",
    body:
      "Neck and back pain are among the most common reasons people see a physiotherapist — and in a neighbourhood full of long desk days, they're familiar to many of us. The good news is that most back and neck pain improves, and staying active is usually part of the solution.\n\n" +
      "We assess how your spine moves, what aggravates your symptoms and whether nerves are involved, as with sciatica. Treatment typically combines hands-on techniques, specific exercises and realistic advice about posture, workstation set-up, sleep and staying active — so you understand your pain and can manage it with confidence.",
    conditions: ["Lower back pain", "Neck pain", "Sciatica (pain spreading into the leg)", "Pain spreading into the arm", "Stiffness after long sitting", "Desk and posture-related strain", "Recurring back pain"],
    whoItMayHelp: "People with new or recurring neck or back pain, sciatica, or pain linked to long hours of sitting.",
    whatToExpect: "A careful assessment, hands-on treatment where helpful, exercises to restore movement and strength, and practical advice for work and daily life.",
    limitations: "Most back pain is not serious, but some symptoms need urgent attention. " + SEEK_URGENT,
    steps: [
      { title: "Screen & assess", body: "Check for anything needing medical review, then assess movement, nerves and what triggers your pain." },
      { title: "Ease the pain", body: "Hands-on techniques and positions or movements that help settle symptoms." },
      { title: "Move & strengthen", body: "Exercises to restore movement and build the strength and endurance your back or neck needs." },
      { title: "Stay well", body: "Posture breaks, workstation tips and a plan for managing future flare-ups." },
    ],
    faqs: [
      { q: "Is bad posture the cause of my back pain?", a: "Posture is rarely the single cause. Staying in any position for a long time can be uncomfortable; regular movement and building strength usually matter more than holding a 'perfect' posture." },
      { q: "Do I need an X-ray or MRI?", a: "Most back and neck pain doesn't need a scan. If your assessment suggests one would change your care, we'll advise you to see a doctor." },
      { q: "Can physiotherapy help sciatica?", a: "Many people with sciatica improve with time and active treatment. We'll monitor your symptoms and advise you promptly if a medical review is needed." },
    ],
    seoTitle: "Back Pain, Neck Pain & Sciatica Physiotherapy in HSR Layout",
    seoDescription: "Physiotherapy for back pain, neck pain, sciatica and posture-related strain at Physio Central by Dr Nitin Sunku, HSR Layout, Bengaluru.",
  },
  {
    code: "PC-STRENGTH",
    slug: "strengthening-and-functional-training",
    name: "Strengthening & Functional Training",
    categorySlug: "strength-function",
    bookable: true,
    durationMinutes: 45,
    billingUnit: "Session",
    sortOrder: 5,
    headline: "Move better — with more strength, balance and flexibility.",
    summary: "Supervised exercise to improve mobility, balance and flexibility — so everyday activities feel easier and safer.",
    body:
      "Strength, balance and flexibility underpin almost everything we do, from climbing stairs and carrying shopping to playing with grandchildren or getting back to the gym. When they slip — after an injury, illness, a period of inactivity or simply with age — daily life can start to feel harder.\n\n" +
      "Our functional training sessions are built around what you want to be able to do. We measure where you're starting from, then guide you through a progressive, supervised programme that's safe for your level, with exercises you can continue at home.",
    conditions: ["Reduced strength or endurance", "Poor balance or fear of falling", "Stiffness and reduced flexibility", "Deconditioning after illness or inactivity", "Returning to exercise after injury", "Staying active with age"],
    whoItMayHelp: "Adults of any age who want to move with more strength, balance and confidence — including older adults and people returning to activity.",
    whatToExpect: "Simple baseline tests, then supervised, progressive exercise sessions with a home programme. We adjust the plan as you get stronger.",
    limitations: "If you have a heart or lung condition, recent surgery or other medical concerns, we'll tailor the programme to your doctor's advice. Stop exercising and seek medical help if you get chest pain, severe breathlessness or feel faint.",
    steps: [
      { title: "Baseline", body: "Simple tests of strength, balance, flexibility and the tasks you find hard." },
      { title: "Plan", body: "A programme built around your goals and current level." },
      { title: "Progress", body: "Supervised sessions that step up safely as you improve." },
      { title: "Keep going", body: "A home or gym plan so you maintain your gains." },
    ],
    faqs: [
      { q: "Is this suitable if I've never exercised?", a: "Yes. Everything is matched to your current level and supervised, so you can start where you are." },
      { q: "Can balance training reduce my risk of falls?", a: "Exercise that challenges balance and builds leg strength is widely recommended to help reduce falls risk in older adults. We'll include it where it's relevant to you." },
      { q: "Do I need special equipment?", a: "No. We use the clinic's equipment in sessions and give you home exercises that need little or nothing." },
    ],
    seoTitle: "Strength, Balance & Mobility Training in HSR Layout",
    seoDescription: "Supervised strengthening and functional training for mobility, balance and flexibility at Physio Central by Dr Nitin Sunku, HSR Layout, Bengaluru.",
  },
  {
    code: "PC-PAIN",
    slug: "pain-management-and-manual-therapy",
    name: "Pain Management & Manual Therapy",
    categorySlug: "pain-management",
    bookable: true,
    durationMinutes: 45,
    billingUnit: "Session",
    sortOrder: 6,
    headline: "Hands-on care and electrotherapy to ease pain.",
    summary: "Pain relief using mobilisation and other hands-on techniques, with electrotherapy where appropriate — as part of an active recovery plan.",
    body:
      "When pain is high, moving can feel impossible. Hands-on (manual) therapy and electrotherapy can help ease pain and stiffness so you're able to move more and take part in your rehabilitation.\n\n" +
      "Manual therapy includes techniques such as joint mobilisation and soft-tissue work, applied by your physiotherapist to the areas involved. Electrotherapy uses gentle electrical or other energy-based modalities that some people find help with short-term pain relief. We use these as part of a wider plan — combined with exercise and advice — because lasting improvement usually comes from moving well and getting stronger.",
    conditions: ["Acute or persistent muscle and joint pain", "Joint stiffness", "Muscle tightness and spasm", "Neck and back pain", "Pain limiting exercise or rehab"],
    whoItMayHelp: "People whose pain or stiffness is making it hard to move, exercise or get through the day.",
    whatToExpect: "We explain each technique before using it and check your comfort throughout. Treatment is adjusted to how you respond and combined with exercises.",
    limitations: "Some techniques aren't suitable for everyone — for example with certain heart devices such as pacemakers, during pregnancy, over areas of active infection or in some other medical conditions. Please tell us about your health history so we can choose safely.",
    steps: [
      { title: "Understand the pain", body: "Assess where it comes from and what makes it better or worse." },
      { title: "Hands-on relief", body: "Mobilisation and soft-tissue techniques to ease pain and stiffness." },
      { title: "Electrotherapy if useful", body: "Used where it suits you, to support short-term pain relief." },
      { title: "Move & build", body: "Exercises that turn short-term relief into longer-term improvement." },
    ],
    faqs: [
      { q: "Does manual therapy hurt?", a: "It shouldn't be more than mildly uncomfortable. We check in throughout and adjust the pressure or technique to suit you." },
      { q: "What is electrotherapy?", a: "A group of treatments that use gentle electrical currents or other energy to help with pain. We'll explain the option we're using and why." },
      { q: "Will I just have passive treatment?", a: "No. Hands-on care helps you move more comfortably, and exercise is what helps you stay better." },
    ],
    seoTitle: "Pain Management, Manual Therapy & Electrotherapy in HSR Layout",
    seoDescription: "Manual therapy, mobilisation and electrotherapy for pain and stiffness at Physio Central by Dr Nitin Sunku, HSR Layout, Bengaluru.",
  },
  {
    code: "PC-HOME",
    slug: "home-visits",
    name: "Home Visits",
    categorySlug: "home-care-visits",
    bookable: false,
    durationMinutes: 60,
    billingUnit: "Visit",
    sortOrder: 7,
    headline: "Personalised physiotherapy at home.",
    summary: "Physiotherapy in the comfort of your home — ideal after surgery, for older adults, or whenever travelling to the clinic is difficult.",
    body:
      "Sometimes the hardest part of physiotherapy is getting to the clinic — in the early weeks after a joint replacement, for an elderly parent, or when pain makes travel difficult. Our home visit service brings assessment and treatment to you.\n\n" +
      "Treating you at home also lets us work on the real environment you live in: the stairs, the bathroom, the bed and the chair you use every day. We tailor exercises to the space and equipment you have, and help family members support your recovery safely.",
    conditions: ["Early recovery after surgery", "Older adults with reduced mobility", "Balance problems and falls risk", "Pain that makes travel difficult", "Ongoing rehabilitation at home"],
    whoItMayHelp: "People who find it difficult to travel to the clinic, especially after surgery or with limited mobility.",
    whatToExpect: "The same thorough assessment and treatment as in the clinic, adapted to your home, with practical advice for safer daily routines.",
    limitations: "Home visits are arranged by phone so we can confirm the area, timing and any travel fee in advance. " + SEEK_URGENT,
    steps: [
      { title: "Call to arrange", body: "We confirm your location, needs and a convenient time, plus any travel fee, before booking." },
      { title: "Assess at home", body: "A full assessment including how you manage stairs, bathroom, bed and chairs." },
      { title: "Treat & adapt", body: "Treatment and exercises suited to your space, with tips to make daily tasks safer." },
      { title: "Review progress", body: "We track progress and move you to clinic visits when you're ready, if you prefer." },
    ],
    faqs: [
      { q: "Which areas do you cover?", a: "Please call the clinic — we'll confirm whether we can reach your area and when." },
      { q: "Is there an extra charge for home visits?", a: "A travel supplement may apply. We'll tell you the total before confirming the visit." },
      { q: "Do I need any equipment?", a: "Usually not. We'll use what's available at home and advise you if anything simple would help." },
    ],
    seoTitle: "Home Physiotherapy in HSR Layout — Home Visits",
    seoDescription: "Personalised physiotherapy at home from Physio Central by Dr Nitin Sunku, HSR Layout, Bengaluru. Ideal after surgery or when travel is difficult.",
  },
];
