import 'server-only';
import type { Logger } from '../logger';
import type { TwentyClient } from '../twenty/client';
import type { Address, Emails, FullName, Links, Person, PersonInput, Phones } from '../twenty/types';

// Person find-or-create shared by every form. Fill-empty rule (spec D7): for a Person matched
// by email, only empty fields are filled; nothing that has a value is overwritten. Composite
// fields are sent whole, merged with what is stored.

/** Marketing/newsletter consent given on a form (spec D5, D17). */
export type MarketingConsent = { at: string; version: string; siteKey?: string };

/** What a form knows about a person. Only `emails` is always present. */
export type PersonData = {
  emails: Emails;
  name?: FullName;
  phones?: Phones;
  location?: Address;
  education?: string;
  linkedinLink?: Links;
  consent?: MarketingConsent;
};

const consentFields = (consent: MarketingConsent): PersonInput => ({
  communicationConsent: true,
  communicationConsentAt: consent.at,
  consentVersion: consent.version,
  ...(consent.siteKey && { communicationConsentSite: consent.siteKey }),
});

export function toNewPersonInput({ consent, ...fields }: PersonData): PersonInput {
  return { ...fields, ...(consent && consentFields(consent)) };
}

const isBlank = (value: string | null | undefined) => !value?.trim();

/** Returns the fields to fill on an existing Person, or null when there is nothing to fill. */
export function fillEmptyPatch(existing: Person, incoming: PersonData): PersonInput | null {
  const patch: PersonInput = {};

  if (incoming.name) {
    const name = existing.name ?? { firstName: '', lastName: '' };
    if (isBlank(name.firstName) || isBlank(name.lastName)) {
      patch.name = {
        firstName: isBlank(name.firstName) ? incoming.name.firstName : name.firstName,
        lastName: isBlank(name.lastName) ? incoming.name.lastName : name.lastName,
      };
    }
  }

  if (incoming.phones && isBlank(existing.phones?.primaryPhoneNumber)) {
    patch.phones = { ...incoming.phones, additionalPhones: existing.phones?.additionalPhones ?? [] };
  }

  if (incoming.location) {
    const stored: Address = existing.location ?? {};
    const filled: Address = { ...stored };
    let changed = false;
    for (const key of ['addressCountry', 'addressState', 'addressCity'] as const) {
      if (isBlank(stored[key]) && !isBlank(incoming.location[key])) {
        filled[key] = incoming.location[key];
        changed = true;
      }
    }
    if (changed) patch.location = filled;
  }

  if (incoming.linkedinLink && isBlank(existing.linkedinLink?.primaryLinkUrl)) {
    patch.linkedinLink = {
      primaryLinkUrl: incoming.linkedinLink.primaryLinkUrl,
      primaryLinkLabel: existing.linkedinLink?.primaryLinkLabel ?? '',
      secondaryLinks: existing.linkedinLink?.secondaryLinks ?? [],
    };
  }

  if (incoming.education && isBlank(existing.education)) patch.education = incoming.education;

  // Consent counts as empty until it is given; once given, the original record is kept.
  if (incoming.consent && existing.communicationConsent !== true) Object.assign(patch, consentFields(incoming.consent));

  return Object.keys(patch).length ? patch : null;
}

export type PeopleDeps = {
  twenty: Pick<TwentyClient, 'findPersonByEmail' | 'createPerson' | 'updatePerson'>;
  logger: Logger;
};

/** Finds the Person by email and fills empty fields, or creates the Person. */
export async function upsertPersonByEmail(
  incoming: PersonData,
  { twenty, logger }: PeopleDeps,
): Promise<{ personId: string; created: boolean }> {
  const person = await twenty.findPersonByEmail(incoming.emails.primaryEmail);
  if (person) {
    const patch = fillEmptyPatch(person, incoming);
    if (patch) await twenty.updatePerson(person.id, patch);
    logger.info('person.matched', { personId: person.id, code: patch ? 'FILLED_EMPTY_FIELDS' : 'NOTHING_TO_FILL' });
    return { personId: person.id, created: false };
  }
  const { id } = await twenty.createPerson(toNewPersonInput(incoming));
  logger.info('person.created', { personId: id });
  return { personId: id, created: true };
}
