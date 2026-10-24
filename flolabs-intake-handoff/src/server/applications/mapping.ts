import 'server-only';
import { APPLICATION_FORM } from '@/shared/config/application';
import { countryName } from '@/shared/config/countries';
import { labelOf } from '@/shared/config/options';
import { PROGRAMS } from '@/shared/config/programs';
import type { ApplicationFormData } from '@/shared/forms/application';
import type { PersonData } from '../people/person';
import type { SiteResolution } from '../sites';
import type { ApplicationInput } from '../twenty/types';

// Form data -> Twenty records. API names: docs/twenty-schema.md.

export function toPersonData(
  data: ApplicationFormData,
  refs: { submittedAt: string; consentSiteKey?: string },
): PersonData {
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
    // Marketing opt-in also fills an empty Person consent (spec D17).
    ...(data.marketingOptIn && {
      consent: { at: refs.submittedAt, version: APPLICATION_FORM.consentVersion, siteKey: refs.consentSiteKey },
    }),
  };
}

/** Display name of the Application record in Twenty, e.g. "Jane Doe - UI/UX Design Intern". */
export function applicationName(data: ApplicationFormData): string {
  const programs = data.programs.map((program) => labelOf(PROGRAMS, program)).join(', ');
  return `${data.firstName} ${data.lastName} - ${programs}`.slice(0, 250);
}

export function toApplicationInput(
  data: ApplicationFormData,
  refs: { personId: string; site: SiteResolution; submittedAt: string; cv: { fileId: string; label: string } },
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
    cvResume: [refs.cv],
    communicationConsent: data.marketingOptIn,
    ...(data.marketingOptIn && { communicationConsentAt: refs.submittedAt }),
    phoneMessagingConsent: data.smsOptIn,
    ...(data.smsOptIn && { phoneMessagingConsentAt: refs.submittedAt }),
    // POC test values (spec section 1); the real pipeline taxonomy is out of scope.
    lifecycleStage: 'INTERESTED',
    leadStatus: 'UNCONTACTED',
  };
}
