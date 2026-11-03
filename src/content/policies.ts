/**
 * Website policies. Plain-language drafts written against what this site
 * actually does (see src/app/(public)/book, src/modules/scheduling/booking.ts).
 * Tokens filled at render time: {{clinic}}, {{phone}}, {{address}}, {{email}}.
 *
 * Not legal advice — have the clinic (and ideally a lawyer) confirm before
 * relying on them. Bump `updated` whenever the text changes.
 */
export interface Policy { title: string; description: string; updated: string; body: string }

export const POLICIES: Record<"privacy" | "terms" | "cancellation-refunds" | "accessibility", Policy> = {
  privacy: {
    title: "Privacy notice",
    description: "How Physio Central collects, uses, stores and protects your personal data, and your rights under India's DPDP Act, 2023.",
    updated: "3 November 2026",
    body: `
This notice explains what personal data {{clinic}} ("we", "us") collects through this website and at the clinic, why we collect it, and the choices and rights you have. We follow the Digital Personal Data Protection Act, 2023 (DPDP Act) and the rules made under it.

## Who we are

{{clinic}} is a physiotherapy clinic at {{address}}. For anything in this notice, call us on {{phone}}{{email_sentence}}

## What we collect

When you send an appointment request we ask for:

- The patient's full name and mobile number (required)
- Email address (optional)
- The service, preferred date and time, and whether you have visited before
- A brief reason for the visit and any access or assistance needs (both optional)
- Your choice on whether to receive occasional clinic updates

We deliberately **do not** ask for detailed medical history on the website. If you become a patient, your physiotherapist records clinical notes, assessment findings and treatment plans as part of your care. Those records are held securely and are only available to the clinical team looking after you.

We also keep basic technical logs (such as IP address and browser type) for security and to keep the site working. We do not use advertising or tracking cookies.

## Why we use it

- To respond to your request, confirm or reschedule your appointment and send reminders
- To provide, record and follow up your treatment
- To issue estimates, invoices and receipts
- To meet legal and regulatory obligations, including medical-record keeping
- To send occasional clinic updates, **only** if you opted in

We rely on your consent, which you give when you submit the booking form, and on purposes the law allows without consent (for example, medical emergencies or complying with a legal obligation).

## Who we share it with

We do not sell your data. We share it only:

- With the clinicians involved in your care, including an onward referral to an orthopaedic surgeon if you agree to one
- With service providers who host and run this website and our booking system, under contract and only for that purpose. Our hosting and database providers store data on servers in Singapore.
- Where the law requires it, for example a valid request from a court or regulator

The map on our contact page is provided by Google. If you interact with it, Google may collect data under its own privacy policy.

## How long we keep it

Appointment requests that don't become a visit are deleted or anonymised once they're no longer needed. Clinical records are kept for at least as long as Indian law requires for medical records, and then securely deleted. If you withdraw marketing consent, we stop sending updates straight away.

## How we protect it

Data is encrypted in transit, access is limited to staff who need it and protected by individual logins, and staff actions on patient records are logged. Your appointment status page is reachable only through a private link sent to you.

## Your rights

Under the DPDP Act you can:

- Ask what personal data we hold about you and how it is used
- Ask us to correct, complete or update it
- Ask us to erase it, where we are not required by law to keep it
- Withdraw your consent at any time (this does not affect anything done before you withdrew it)
- Nominate someone to exercise these rights on your behalf if you die or become unable to
- Raise a grievance with us, and if you are not satisfied, complain to the Data Protection Board of India

To use any of these rights, call {{phone}} or speak to the front desk. We will verify your identity before acting on a request.

## Children

If the patient is under 18, a parent or lawful guardian must make the request and give consent on their behalf.

## Changes

We will update this page if our practices change and show the date of the latest version at the top.
`,
  },

  terms: {
    title: "Terms of use",
    description: "The terms that apply when you use the Physio Central website and online appointment request.",
    updated: "3 November 2026",
    body: `
These terms apply to your use of this website, operated by {{clinic}} ({{address}}). By using the site you agree to them.

## Not medical advice

Content on this website, including service pages and blog articles, is general information. It is not a diagnosis and does not replace an assessment by a qualified clinician. Don't start, stop or change any treatment based on it without speaking to a professional.

> **In an emergency**
> Call **112** or go to the nearest emergency department. Do not use this website or our phone line for emergencies.

## Appointment requests

- An online request is **not** a confirmed booking. It becomes an appointment only when the clinic confirms it.
- Please give accurate details. We may decline or cancel requests that look false, abusive or automated.
- Fees shown on the site are for guidance. Where a fee depends on your assessment, we give you an itemised estimate to agree to before treatment.
- Cancellations and changes are covered by our [cancellation and refunds policy](/cancellation-refunds).

## Your private appointment link

After a request you receive a private link to check or cancel it. Please don't share it. Anyone with the link can see the request details.

## Acceptable use

Please don't try to break, overload or gain unauthorised access to the site or its systems, submit other people's details without their permission, or copy the site's content for commercial use.

## Links to other sites

We link to other websites, including the orthopaedic practice of Dr Nitin N Sunku. We are not responsible for the content or privacy practices of external sites.

## Content and trademarks

The text, design and logo on this site belong to {{clinic}} or are used with permission. Stock photographs are illustrative and licensed from their owners.

## Liability

We work to keep the site accurate and available, but we cannot guarantee it will always be error-free or uninterrupted. To the extent the law allows, we are not liable for loss arising from your use of the website. Nothing in these terms limits liability that cannot be limited under Indian law, or your rights as a consumer.

## Governing law

These terms are governed by the laws of India. Courts in Bengaluru, Karnataka have jurisdiction over any dispute.

## Contact

Questions about these terms: {{phone}}.
`,
  },

  "cancellation-refunds": {
    title: "Cancellation & refunds",
    description: "How to cancel or change a Physio Central appointment, and how fees and refunds work.",
    updated: "3 November 2026",
    body: `
## Requests and confirmation

An online appointment request is pending until the clinic confirms it, usually within one working day. Until then, no slot is reserved for you and nothing is charged.

## Cancelling or rescheduling

- **Online:** use the private link you received after your request.
- **By phone:** call {{phone}} during opening hours.

Please let us know as early as you can, ideally **at least 24 hours before** your appointment, so we can offer the time to another patient.

## Late cancellations and missed appointments

We understand that things come up. If appointments are repeatedly missed or cancelled at short notice, we may ask for payment in advance before booking further sessions.

## Fees and payment

- Fees are paid at the clinic after each session, unless you have agreed a package in advance.
- Where a fee depends on your assessment, you receive an itemised estimate to accept first. Any extra item needs your approval on the new total.
- We do not take online payments through this website at present.

## Refunds

- If **we** cancel or cannot provide a session you have paid for, you get a full refund or a rescheduled session, whichever you prefer.
- For prepaid packages, unused sessions are refunded on request, less any discount that applied only because of the package size.
- Refunds are made to the original payment method, normally within 7 working days of approval.

## Home visits

Home visits are arranged by phone. Please give as much notice as possible if you need to cancel, as your physiotherapist will already be travelling to you.

## Questions

Call {{phone}} and we'll help.
`,
  },

  accessibility: {
    title: "Accessibility",
    description: "Physio Central's commitment to an accessible website and clinic, and how to ask for help.",
    updated: "3 November 2026",
    body: `
We want everyone to be able to use this website and visit the clinic comfortably.

## The website

This site is designed to meet the **Web Content Accessibility Guidelines (WCAG) 2.2, level AA**. In practice that means:

- It works with a keyboard alone, with a visible focus outline and a "skip to content" link
- Pages use proper headings and landmarks for screen readers, and images have text alternatives
- Text and buttons meet colour-contrast guidelines, and text can be enlarged to 200% without breaking the layout
- Animations are switched off if your device is set to reduce motion
- Forms have clear labels, hints and error messages

## At the clinic

The clinic is on the **first floor**. If stairs are difficult, or you need any other help (a longer appointment, someone to accompany you, or information in another format), please mention it in the "access or assistance needs" box when you book, or call {{phone}} and we'll plan your visit with you. Home visits are also available.

## Known limitations

The embedded Google map on the contact page is provided by Google and may not be fully accessible. The full address and a directions link are always shown as text alongside it.

## Feedback

If anything on this site is hard to use, please tell us on {{phone}}. We aim to respond within 5 working days and to fix problems as quickly as we can.
`,
  },
};
