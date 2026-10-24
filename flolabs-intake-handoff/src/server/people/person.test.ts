import { describe, expect, it } from 'vitest';
import type { Person } from '../twenty/types';
import { fillEmptyPatch, toNewPersonInput } from './person';

const consent = { at: '2026-10-24T10:00:00.000Z', version: 'newsletter-consent-v1', siteKey: 'robocollective' };
const emails = { primaryEmail: 'jane.doe@example.com', additionalEmails: [] };

const stored = (overrides: Partial<Person> = {}): Person => ({
  id: '00000000-0000-4000-8000-0000000000aa',
  name: { firstName: 'Jane', lastName: 'Doe' },
  emails,
  phones: null,
  location: null,
  linkedinLink: null,
  education: null,
  communicationConsent: false,
  ...overrides,
});

describe('Person consent (spec D17)', () => {
  it('stores consent, time, version and site on a new Person', () => {
    expect(toNewPersonInput({ emails, consent })).toEqual({
      emails,
      communicationConsent: true,
      communicationConsentAt: consent.at,
      consentVersion: consent.version,
      communicationConsentSite: 'robocollective',
    });
  });

  it('fills consent on an existing Person who has not consented yet', () => {
    expect(fillEmptyPatch(stored(), { emails, consent })).toEqual({
      communicationConsent: true,
      communicationConsentAt: consent.at,
      consentVersion: consent.version,
      communicationConsentSite: 'robocollective',
    });
  });

  it('keeps the original consent record when the Person already consented', () => {
    const already = stored({ communicationConsent: true, communicationConsentAt: '2026-01-01T00:00:00.000Z', consentVersion: 'old' });
    expect(fillEmptyPatch(already, { emails, consent })).toBeNull();
  });

  it('never removes consent when a later form has no opt-in', () => {
    const already = stored({ communicationConsent: true });
    expect(fillEmptyPatch(already, { emails, name: { firstName: 'Jane', lastName: 'Doe' } })).toBeNull();
  });

  it('only touches the fields a form provides (newsletter: no name, phone or address)', () => {
    const blank = stored({ name: { firstName: '', lastName: '' }, education: null });
    expect(fillEmptyPatch(blank, { emails, consent })).not.toHaveProperty('name');
    expect(fillEmptyPatch(blank, { emails, consent })).not.toHaveProperty('education');
  });
});
