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
  communicationConsent?: boolean | null;
  communicationConsentAt?: string | null;
  consentVersion?: string | null;
  communicationConsentSite?: string | null;
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
  cvResume?: { fileId: string; label: string }[];
  lifecycleStage?: string;
  leadStatus?: string;
  name?: string;
};

export type ApplicationRef = { id: string; personId: string | null };

/** What a Form 1/2/3 link needs: who the applicant is and which programs they chose (pre-fill, D4). */
export type ApplicationForLink = {
  id: string;
  positionAppliedFor: string[];
  person: { id: string; name: FullName | null; emails: Emails | null } | null;
};

export type InquiryInput = {
  name: string;
  subject: string;
  message: string;
  status: 'NEW' | 'IN_PROGRESS' | 'CLOSED';
  submittedAt: string;
  submissionKey: string;
  personId: string;
  /** Set for KNOWN and INACTIVE; left empty for MISSING and UNKNOWN. */
  siteId?: string;
  siteStatus: SiteStatus;
  siteKeyReceived?: string;
};

export type FormSubmissionInput = {
  name: string;
  formType: 'CONTACTED' | 'BEFORE_MEETING' | 'MASTERCLASS';
  tracks: string[];
  formVersion: string;
  submittedAt: string;
  submissionKey: string;
  /** RAW_JSON keyed by question id (source of truth). */
  answers: Record<string, unknown>;
  /** RICH_TEXT generated from `answers`; Twenty stores the markdown. */
  answersSummary: { markdown: string };
  hoursPerWeek?: number;
  commitmentDuration?: string;
  remoteOk?: boolean;
  canAttendMeetings?: boolean;
  stillInterested?: string;
  continueToInterview?: boolean;
  canMeetCommitment?: string;
  referencesContactAllowed?: boolean;
  applicationId: string;
};

export type FormSubmissionRef = { id: string; applicationId: string | null; formType: string };

export type ReferenceInput = {
  /** The reference's full name (field labelled "Full Name" in Twenty). */
  name: string;
  title: string;
  organization: string;
  relationship: string;
  email: Emails;
  phone?: Phones;
  knownDuration: string;
  applicationId: string;
};
