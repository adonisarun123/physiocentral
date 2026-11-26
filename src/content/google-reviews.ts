/**
 * Patient reviews from the clinic's Google Business Profile, copied by hand.
 *
 * Source: https://share.google/mpHk7Q1wGpuiZHMAb (the clinic's Google listing).
 * Captured 26 Nov 2026: 4.9 average from 11 reviews (ten 5-star, one 4-star).
 *
 * Rules for this file:
 * - Review text is verbatim. Do not edit patients' words, fix typos or merge reviews.
 * - Names are shortened to first name + initial; the full review stays public on Google.
 * - The 4-star review stays in. Leaving it out would make the wall look curated.
 * - Left out: one rating with no text, and one review that names a different hospital.
 * - NO Review / AggregateRating schema for these. Google treats a business marking up
 *   reviews of itself as self-serving and ineligible for review rich results.
 * - Update RATING and COUNT whenever reviews are added, or the summary goes stale.
 */

export const GOOGLE_REVIEWS_URL = "https://share.google/mpHk7Q1wGpuiZHMAb";

export const GOOGLE_RATING = { rating: 4.9, count: 11, capturedOn: "26 Nov 2026" } as const;

export type GoogleReview = { name: string; rating: 1 | 2 | 3 | 4 | 5; when: string; text: string; localGuide?: boolean };

export const GOOGLE_REVIEWS: GoogleReview[] = [
  {
    name: "Rahul G.",
    rating: 5,
    when: "Nov 2026",
    text: "Had a great experience during my neuropraxia treatment. The staff are very friendly, professional and supportive.\nA special thanks to Paul and Priya for their patience, dedication and personal attention throughout my recovery. They guide me through every exercise and keep me motivated.\nReally happy with the treatment and overall experience. Highly recommend this centre to anyone looking for quality physiotherapy!",
  },
  {
    name: "Mallangouda P.",
    rating: 5,
    when: "Nov 2026",
    localGuide: true,
    text: "Best physiotherapy centre in HSR layout.\nHad severe neck pain consulted dr Nitin sunku sir advised to go for physio, after taking 2 sessions I'm feeling much better now. Thanks to dr Nitin sir and team",
  },
  {
    name: "Vydhyam C.",
    rating: 5,
    when: "Nov 2026",
    text: "I had a really good experience here. The physiotherapist was very professional, friendly, and knowledgeable. The treatment was excellent, and the consultation was very helpful and satisfying. The clinic environment was neat, clean, and hygienic, with well-maintained beds and surroundings. Overall, the staff were supportive, and the care provided was really good. Highly recommended for anyone looking for quality physiotherapy treatment!",
  },
  {
    name: "Sathya P.",
    rating: 5,
    when: "Nov 2026",
    localGuide: true,
    text: "I have leg pain for a month, I went for physiotherapy treatment here now I feel better pain reduced thank you",
  },
  {
    name: "Vishnu Priya B.",
    rating: 4,
    when: "Nov 2026",
    text: "Good treatment and supportive staff. The sessions were helpful, and the overall experience was good.\nVery helpful consultation, clean beds, and a neat, hygienic environment. Highly satisfied with the care and service. Highly recommended!",
  },
  {
    name: "Usha S.",
    rating: 5,
    when: "Nov 2026",
    text: "Excellent physiotherapy service,the treatment! The treatment was effective,and physiotherapist was very supportive. Iam happy with the improvement and would highly recommend the service",
  },
  {
    name: "Arnab S.",
    rating: 5,
    when: "Nov 2026",
    text: "Best physiotherapy in the hsr layout., physical therapy and rehabilitation services also good here.",
  },
  {
    name: "Bharath H.",
    rating: 5,
    when: "Nov 2026",
    localGuide: true,
    text: "Good experience with physiocentral.And affordable treatment price.",
  },
  {
    name: "Taposhi B.",
    rating: 5,
    when: "Nov 2026",
    text: "Good physio place in hsr",
  },
];
