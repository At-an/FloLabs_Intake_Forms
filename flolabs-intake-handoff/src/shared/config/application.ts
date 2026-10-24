// Fixed settings of the Application form. Bump FORM_VERSION when questions or rules change,
// and CONSENT_VERSION whenever any consent wording below changes (stored with each consent).

export const APPLICATION_FORM = {
  sourceFormId: 'application',
  formVersion: '1',
  consentVersion: 'application-consent-v1',
  defaultSiteKey: 'flolabs_international',
} as const;

export const HR_EMAIL = 'hr@flolabsinnovations.com';

// Wording approved by FloLabs on 2026-10-24 (consentVersion application-consent-v1).
export const CONSENT_TEXT = {
  safeSender: `I have added ${HR_EMAIL} to my contacts (safe sender list).`,
  marketing: 'Send me FloLabs news, programs and event updates by email.',
  sms: 'Send me text messages (SMS) about my application and FloLabs programs.',
} as const;

export const LIMITS = {
  name: 100,
  email: 254,
  city: 100,
  state: 100,
  education: 200,
  linkedinUrl: 300,
  sourceDetail: 200,
  referralName: 150,
} as const;
