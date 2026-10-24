// Shapes of the Twenty records this app reads and writes.
// API names come from docs/twenty-schema.md; option values are typed in T4's config.

// Composite fields are read and written as whole groups, so a fill-empty update never
// blanks a sub-field the app does not manage (e.g. street, additional phones).
export type FullName = { firstName: string; lastName: string };
export type Emails = { primaryEmail: string; additionalEmails?: string[] | null };
export type AdditionalPhone = { number: string; countryCode: string; callingCode: string };
export type Phones = {
  primaryPhoneNumber: string;
  primaryPhoneCountryCode: string;
  primaryPhoneCallingCode: string;
  additionalPhones?: AdditionalPhone[] | null;
};
export type Address = {
  addressStreet1?: string | null;
  addressStreet2?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressPostcode?: string | null;
  addressCountry?: string | null;
  addressLat?: number | null;
  addressLng?: number | null;
};
export type Links = {
  primaryLinkUrl: string;
  primaryLinkLabel?: string | null;
  secondaryLinks?: { url: string; label: string }[] | null;
};

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

export type SiteStatus = 'KNOWN' | 'MISSING' | 'UNKNOWN' | 'INACTIVE';

export type ApplicationInput = {
  personId: string;
  /** Set for KNOWN and INACTIVE; left empty for MISSING and UNKNOWN. */
  siteId?: string;
  siteStatus: SiteStatus;
  siteKeyReceived?: string;
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
