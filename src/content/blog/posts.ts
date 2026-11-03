/**
 * Blog posts. Add a post = add an object to POSTS (newest first doesn't matter;
 * the list is sorted by date). Body uses the markdown subset documented in
 * src/components/site/markdown.tsx.
 *
 * Clinical content: set `reviewedBy` only once the named clinician has actually
 * reviewed the text — the "Medically reviewed by" line renders only when set.
 */
export interface Post {
  slug: string;
  title: string;
  description: string; // ~150 chars, used for meta description and cards
  category: "Sports injuries" | "Post-surgery rehab" | "Back & neck" | "Joint pain";
  date: string; // YYYY-MM-DD
  updated?: string;
  image: string; // under /public
  imageAlt: string;
  author: string;
  reviewedBy?: string; // name of reviewing clinician; registration is shown from ORTHO when it matches
  relatedService?: string; // service slug
  body: string;
}

export const POSTS: Post[] = [
  {
    slug: "acl-reconstruction-recovery-timeline",
    title: "ACL reconstruction recovery: a phase-by-phase rehab guide",
    description: "What recovery after ACL surgery usually looks like, from the first week to return to sport, and the milestones physiotherapists check before you progress.",
    category: "Sports injuries",
    date: "2026-11-03",
    image: "/images/stock/sports-in.webp",
    imageAlt: "Runners in a road race",
    author: "Physio Central clinical team",
    reviewedBy: "Dr Nitin N Sunku",
    relatedService: "post-surgical-rehabilitation",
    body: `
An anterior cruciate ligament (ACL) reconstruction is only half the treatment. The other half is rehabilitation, and it decides how well, and how safely, you get back to running, turning and playing sport.

Every surgeon has their own protocol, and **your surgeon's instructions always come first**. But most ACL rehab follows the same broad phases. Progress is guided by milestones, not just the calendar.

## Phase 1: Protect and settle (roughly weeks 0–2)

The early goals are simple but important:

- Control swelling and pain with rest, elevation, ice and compression
- Get the knee **fully straight**. Losing extension early is one of the hardest problems to fix later.
- Wake up the quadriceps with exercises like static quads and straight-leg raises
- Walk with crutches, weaning off them as your surgeon allows and your gait looks normal

## Phase 2: Restore movement and walking (roughly weeks 2–6)

- Gradually build knee bend (flexion) towards full range
- Walk normally without crutches or a limp
- Start closed-chain strengthening such as mini-squats, step-ups, bridges and an exercise bike
- Build balance on the operated leg

## Phase 3: Build strength (roughly weeks 6–12)

This is where most of the hard work happens. Strength in the quadriceps, hamstrings and hips needs to come back towards that of your other leg. Expect progressive loading in the gym, single-leg work and more demanding balance drills.

## Phase 4: Running and agility (roughly months 3–6)

When strength, control and swelling allow, your physiotherapist introduces a structured return to running, then hopping, landing, cutting and change-of-direction drills. Landing technique, knees not collapsing inwards, gets a lot of attention here.

## Phase 5: Return to sport (usually 9 months or later)

Research consistently shows that returning to pivoting sport **too early increases the risk of re-injury**. Most clinicians now advise at least nine months, and only after passing objective tests:

- Strength of the operated leg close to the other side (often 90% or more)
- Hop tests within a similar range
- Full, pain-free movement and no swelling with training
- Feeling confident and ready, not just physically able

> **Call your surgeon or physio promptly if you notice**
> Increasing pain, redness or warmth around the wound, fever, calf pain or swelling, or a sudden loss of knee movement.

## How we help

At Physio Central, ACL rehab follows the operating surgeon's protocol, with milestone testing at each stage and a clear plan for what comes next. Because the clinic is led by orthopaedic and sports-medicine surgeon Dr Nitin Sunku, Team Doctor for Bengaluru FC, any concern can be reviewed quickly.

[Book an assessment](/book) or read about our [post-surgical rehabilitation](/services/post-surgical-rehabilitation).
`,
  },
  {
    slug: "physiotherapy-after-knee-replacement",
    title: "Physiotherapy after knee replacement: what the first 12 weeks look like",
    description: "A practical guide to recovery after total knee replacement (TKR): bending, straightening, walking and strength goals week by week, and common questions.",
    category: "Post-surgery rehab",
    date: "2026-11-03",
    image: "/images/stock/postsurg-in2.webp",
    imageAlt: "A physiotherapist working with a patient's leg",
    author: "Physio Central clinical team",
    reviewedBy: "Dr Nitin N Sunku",
    relatedService: "post-surgical-rehabilitation",
    body: `
A total knee replacement (TKR) can relieve years of arthritis pain, but the new joint only works as well as the muscles and movement around it. Physiotherapy in the first three months makes the biggest difference to how well you walk, climb stairs and get back to daily life.

Your surgeon's protocol takes priority. This is the typical shape of recovery.

## Weeks 0–2: Early movement

- Start walking with a walker or crutches, often the day after surgery
- Work on getting the knee **straight**: lying with the heel supported and the knee unsupported helps
- Bend the knee gently and regularly: heel slides, seated knee bends
- Ankle pumps and static quads to help circulation and wake up the thigh muscles
- Manage swelling with elevation and ice, and take pain relief as prescribed so you can do your exercises

## Weeks 2–6: Range and confidence

Typical goals are a knee that straightens fully and bends to about 90 degrees or more, walking with one stick or none, and managing stairs one step at a time. Stationary cycling often starts in this phase.

## Weeks 6–12: Strength and function

- Progressive strengthening: sit-to-stand, step-ups, bridges, gentle squats
- Balance work, especially if you were unsteady before surgery
- Longer walks, normal stairs and getting back to activities like driving (when your surgeon clears it)

Most people continue to improve for up to a year, but the first 12 weeks set the foundation.

## Common questions

### Is some pain normal?

Yes. Aching and stiffness, especially after exercise and at night, are common for several weeks. Pain that is getting worse rather than better, or that stops you doing your exercises, should be checked.

### How much should I bend my knee?

Little and often beats occasional forceful stretching. Your physiotherapist will set targets for each week and measure your progress.

### Can I have physiotherapy at home?

Yes. For the first weeks after surgery, when travel is difficult, we offer [home visits](/services/home-visits).

> **Seek urgent advice if you notice**
> Calf pain or swelling, breathlessness or chest pain, fever, or a wound that becomes red, hot or starts leaking.

[Book post-surgery physiotherapy](/book) or call the clinic to plan your recovery before your operation.
`,
  },
  {
    slug: "lower-back-pain-when-to-see-a-physio",
    title: "Lower back pain: what helps, and when to see a physiotherapist",
    description: "Most lower back pain settles with the right movement and advice. Here's what helps, what to avoid, and the warning signs that need urgent medical attention.",
    category: "Back & neck",
    date: "2026-11-03",
    image: "/images/stock/spine-in.webp",
    imageAlt: "A physiotherapist examining a young man",
    author: "Physio Central clinical team",
    reviewedBy: "Dr Nitin N Sunku",
    relatedService: "spine-and-posture-care",
    body: `
Lower back pain is one of the most common reasons people miss work, and it can be frightening when it starts suddenly. The reassuring news: **most back pain is not caused by serious damage**, and the majority of episodes improve within a few weeks.

## What usually helps

- **Keep moving.** Gentle walking and normal activity, within comfort, speed recovery. Long bed rest makes back pain worse.
- **Heat** can ease muscle spasm.
- **Pain relief** as advised by a pharmacist or doctor can help you stay active.
- **Change position often** if you sit for long periods at a desk.
- **Sleep:** find a comfortable position, such as a pillow between the knees when lying on your side.

## What to avoid

- Staying in bed or avoiding all movement
- Assuming a scan is needed. Imaging often shows age-related changes that are not the cause of the pain, and most people don't need one.
- Fear of bending. Your spine is strong and designed to move.

## When to see a physiotherapist

Book an assessment if:

- Pain hasn't started improving after 1–2 weeks
- It keeps coming back
- Pain spreads into the buttock or leg (for example sciatica)
- It's stopping you from working, sleeping or exercising

A physiotherapist will find out what's driving your pain, show you which movements help, and build a strengthening plan to reduce the chance of it recurring.

> **Get emergency help (call 112) if you have back pain with**
> Numbness around the genitals or buttocks ("saddle" area), new difficulty passing urine or controlling your bladder or bowels, or weakness in both legs. These can be signs of cauda equina syndrome, which needs urgent treatment.

You should also see a doctor promptly if back pain comes with fever, unexplained weight loss, a history of cancer, or follows a significant fall or accident.

## How we help

At Physio Central, back pain treatment combines a thorough assessment, hands-on care to settle pain, and progressive exercise so improvement lasts. If something needs a specialist opinion, Dr Nitin Sunku's orthopaedic practice is one referral away.

[Book an assessment](/book) or see [spine and posture care](/services/spine-and-posture-care).
`,
  },
  {
    slug: "frozen-shoulder-stages-and-treatment",
    title: "Frozen shoulder: the three stages and how physiotherapy helps",
    description: "Frozen shoulder (adhesive capsulitis) causes pain and stiffness that can last months. Learn the stages, who gets it, and how physiotherapy eases recovery.",
    category: "Joint pain",
    date: "2026-11-03",
    image: "/images/stock/pain-in3.webp",
    imageAlt: "A therapist treating a woman's neck and shoulder",
    author: "Physio Central clinical team",
    reviewedBy: "Dr Nitin N Sunku",
    relatedService: "orthopaedic-physiotherapy",
    body: `
Frozen shoulder, or **adhesive capsulitis**, happens when the capsule around the shoulder joint becomes inflamed and then thickened and tight. The result is pain and a steady loss of movement, especially reaching up, out to the side, or behind your back.

It's most common between ages 40 and 60, and more common in women and in people with diabetes or thyroid conditions. It can also follow a period of not moving the arm, for example after an injury or surgery.

## The three stages

### 1. Freezing (painful stage)

Pain builds gradually and is often worse at night. Movement starts to reduce. This stage can last a few weeks to several months.

### 2. Frozen (stiff stage)

Pain often eases, but stiffness is at its worst. Everyday tasks like dressing, combing hair or reaching a shelf become difficult.

### 3. Thawing (recovery stage)

Movement slowly returns. Many people recover most of their movement, although full recovery can take one to two years or more.

## How physiotherapy helps

Physiotherapy can't switch off the condition, but it helps you through it with less pain and better movement:

- **Pain relief and advice** in the painful stage, including sleeping positions and how to keep using the arm without flaring it up
- **Gentle stretching and mobility work**, pitched to the stage you're in. Too aggressive too early tends to make it worse.
- **Strengthening** of the shoulder blade and rotator cuff muscles as movement returns
- **A home programme** you can do little and often

## When other treatment may help

If pain is severe or progress stalls, an orthopaedic specialist may discuss options such as an image-guided steroid injection or hydrodilatation. At Physio Central, your physiotherapist can refer you to Dr Nitin Sunku for an orthopaedic opinion if needed.

> **Not every stiff shoulder is a frozen shoulder**
> Rotator cuff tears, arthritis and referred pain from the neck can look similar. A proper assessment matters before starting treatment.

[Book a shoulder assessment](/book) or read about [orthopaedic physiotherapy](/services/orthopaedic-physiotherapy).
`,
  },
];

export function readingMinutes(body: string) {
  return Math.max(2, Math.round(body.split(/\s+/).length / 220));
}

export function sortedPosts() {
  return [...POSTS].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

export function fmtDate(d: string) {
  return new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function getPost(slug: string) {
  return POSTS.find((p) => p.slug === slug) ?? null;
}
