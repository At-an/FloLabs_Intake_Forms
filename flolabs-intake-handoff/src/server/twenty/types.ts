// Shapes of the Twenty records this app reads and writes.
// API names come from docs/twenty-schema.md; option values are typed in T4's config.

export type FullName = { firstName: string; lastName: string };
export type Emails = { primaryEmail: string; additionalEmails?: string[] };
export type Phones = {
  primaryPhoneNumber: string;
  primaryPhoneCountryCode: string;
  primaryPhoneCallingCode: string;
};
export type Address = {
  addressCountry?: string;
  addressState?: string;
  addressCity?: string;
};
export type Links = { primaryLinkUrl: string; primaryLinkLabel?: string };

export type Person = {
  id: string;
  name: FullName | null;
  emails: Emails | null;
  phones: Phones | null;
  location: Address | null;
  linkedinLink: Links | null;
  education: string | null;
};

export type PersonInput = Partial<Omit<Person, 'id'>>;

export type Site = { id: string; siteId: string; active: boolean };

export type ApplicationInput = {
  personId: string;
  siteId: string;
  submissionKey: string;
  positionAppliedFor: string[];
  source: string;
  sourceDetail?: string;
  referralName?: string;
  safeSenderConfirmed: boolean;
  submittedAt: string;
  sourceFormId: string;
  formVersion: string;
  communicationConsent?: boolean;
  communicationConsentAt?: string;
  phoneMessagingConsent?: boolean;
  phoneMessagingConsentAt?: string;
  consentVersion?: string;
  lifecycleStage?: string;
  leadStatus?: string;
  name?: string;
};

export type ApplicationRef = { id: string; personId: string | null };
