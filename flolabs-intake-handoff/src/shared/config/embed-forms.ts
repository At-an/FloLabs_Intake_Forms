// Settings of the two embedded forms (Contact Us, Newsletter). Bump a version when its
// questions or wording change; consent versions are stored with each consent.

export const CONTACT_US_FORM = {
  formVersion: '1',
  limits: { name: 100, email: 254, subject: 150, message: 5000 },
} as const;

export const NEWSLETTER_FORM = {
  consentVersion: 'newsletter-consent-v1',
} as const;

// Draft wording for FloLabs review.
export const NEWSLETTER_TEXT = {
  title: 'Get FloLabs updates',
  consent: 'By subscribing, you agree to receive FloLabs news, programs and event updates by email. You can unsubscribe at any time.',
  done: 'Thank you for subscribing!',
} as const;

/** The forms that can be embedded with embed.js, by their `data-flolabs-form` value. */
export const EMBED_FORMS = ['contact-us', 'newsletter'] as const;
export type EmbedForm = (typeof EMBED_FORMS)[number];
