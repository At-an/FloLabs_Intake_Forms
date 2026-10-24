import 'server-only';
import { APPLICATION_FORM } from '@/shared/config/application';
import { countryName } from '@/shared/config/countries';
import { labelOf } from '@/shared/config/options';
import { PROGRAMS } from '@/shared/config/programs';
import type { ApplicationFormData } from '@/shared/forms/application';
import type { Address, ApplicationInput, Emails, FullName, Links, Person, PersonInput, Phones, SiteStatus } from '../twenty/types';

// Form data -> Twenty records. API names: docs/twenty-schema.md.

type NewPerson = {
  name: FullName;
  emails: Emails;
  phones: Phones;
  location: Address;
  education: string;
  linkedinLink?: Links;
};

export function toPersonInput(data: ApplicationFormData): NewPerson {
  return {
    name: { firstName: data.firstName, lastName: data.lastName },
    emails: { primaryEmail: data.email, additionalEmails: [] },
    phones: {
      primaryPhoneNumber: data.phone.nationalNumber,
      primaryPhoneCountryCode: data.phone.countryCode,
      primaryPhoneCallingCode: data.phone.callingCode,
      additionalPhones: [],
    },
    location: {
      addressCountry: countryName(data.country),
      addressState: data.state ?? '',
      addressCity: data.city,
    },
    education: data.education,
    ...(data.linkedinUrl && {
      linkedinLink: { primaryLinkUrl: data.linkedinUrl, primaryLinkLabel: '', secondaryLinks: [] },
    }),
  };
}

const isBlank = (value: string | null | undefined) => !value?.trim();

/**
 * Fill-empty rule (spec D7): for a Person matched by email, only empty fields are filled;
 * nothing that already has a value is overwritten. Composite fields are sent whole, merged
 * with what is stored. Returns null when there is nothing to fill.
 */
export function fillEmptyPatch(existing: Person, incoming: NewPerson): PersonInput | null {
  const patch: PersonInput = {};

  const name = existing.name ?? { firstName: '', lastName: '' };
  if (isBlank(name.firstName) || isBlank(name.lastName)) {
    patch.name = {
      firstName: isBlank(name.firstName) ? incoming.name.firstName : name.firstName,
      lastName: isBlank(name.lastName) ? incoming.name.lastName : name.lastName,
    };
  }

  if (isBlank(existing.phones?.primaryPhoneNumber)) {
    patch.phones = { ...incoming.phones, additionalPhones: existing.phones?.additionalPhones ?? [] };
  }

  const stored: Address = existing.location ?? {};
  const filled: Address = { ...stored };
  let locationChanged = false;
  for (const key of ['addressCountry', 'addressState', 'addressCity'] as const) {
    if (isBlank(stored[key]) && !isBlank(incoming.location[key])) {
      filled[key] = incoming.location[key];
      locationChanged = true;
    }
  }
  if (locationChanged) patch.location = filled;

  if (incoming.linkedinLink && isBlank(existing.linkedinLink?.primaryLinkUrl)) {
    patch.linkedinLink = {
      primaryLinkUrl: incoming.linkedinLink.primaryLinkUrl,
      primaryLinkLabel: existing.linkedinLink?.primaryLinkLabel ?? '',
      secondaryLinks: existing.linkedinLink?.secondaryLinks ?? [],
    };
  }

  if (isBlank(existing.education)) patch.education = incoming.education;

  return Object.keys(patch).length ? patch : null;
}

/** Outcome of reading `?site=` from the application link (spec section 1). */
export type SiteResolution = { status: SiteStatus; siteId?: string; keyReceived?: string };

/** Display name of the Application record in Twenty, e.g. "Jane Doe - UI/UX Design Intern". */
export function applicationName(data: ApplicationFormData): string {
  const programs = data.programs.map((program) => labelOf(PROGRAMS, program)).join(', ');
  return `${data.firstName} ${data.lastName} - ${programs}`.slice(0, 250);
}

export function toApplicationInput(
  data: ApplicationFormData,
  refs: { personId: string; site: SiteResolution; submittedAt: string },
): ApplicationInput {
  return {
    name: applicationName(data),
    personId: refs.personId,
    ...(refs.site.siteId && { siteId: refs.site.siteId }),
    siteStatus: refs.site.status,
    ...(refs.site.keyReceived && { siteKeyReceived: refs.site.keyReceived }),
    submissionKey: data.submissionKey,
    positionAppliedFor: data.programs,
    source: data.source,
    ...(data.sourceDetail && { sourceDetail: data.sourceDetail }),
    ...(data.referralName && { referralName: data.referralName }),
    safeSenderConfirmed: data.safeSenderConfirmed,
    submittedAt: refs.submittedAt,
    sourceFormId: APPLICATION_FORM.sourceFormId,
    formVersion: APPLICATION_FORM.formVersion,
    consentVersion: APPLICATION_FORM.consentVersion,
    communicationConsent: data.marketingOptIn,
    ...(data.marketingOptIn && { communicationConsentAt: refs.submittedAt }),
    phoneMessagingConsent: data.smsOptIn,
    ...(data.smsOptIn && { phoneMessagingConsentAt: refs.submittedAt }),
    // POC test values (spec section 1); the real pipeline taxonomy is out of scope.
    lifecycleStage: 'INTERESTED',
    leadStatus: 'UNCONTACTED',
  };
}
