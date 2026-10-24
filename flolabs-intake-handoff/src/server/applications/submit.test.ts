import { describe, expect, it } from 'vitest';
import { applicationSchema, type ApplicationFormData, type ApplicationFormInput } from '@/shared/forms/application';
import type { Person } from '../twenty/types';
import { captureLogger, fakeTwenty, SITES } from './fake-twenty';
import { submitApplication } from './submit';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const KEY = '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b';

const formInput: ApplicationFormInput = {
  submissionKey: KEY,
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane.doe@example.com',
  phone: { country: 'US', number: '(512) 555-0142' },
  country: 'US',
  state: 'Texas',
  city: 'Austin',
  linkedinUrl: 'linkedin.com/in/jane-doe',
  education: 'BSc Computer Science',
  programs: ['UI_UX_DESIGN_INTERN', 'FINANCE_INTERN'],
  source: 'REFERRAL',
  referralName: 'Ange Tchakoute',
  safeSenderConfirmed: true,
};

const data = (overrides: Partial<ApplicationFormInput> = {}): ApplicationFormData =>
  applicationSchema.parse({ ...formInput, ...overrides });

const run = (fake: ReturnType<typeof fakeTwenty>, siteKey?: string, input = data()) => {
  const { logger, lines } = captureLogger();
  return { promise: submitApplication(input, siteKey, { twenty: fake.twenty, logger, now: () => NOW }), lines };
};

describe('submitApplication: new applicant', () => {
  it('creates the Person with the mapped fields and exactly one Application', async () => {
    const fake = fakeTwenty();
    const { promise } = run(fake, 'robocollective');
    const result = await promise;

    expect(result.duplicate).toBe(false);
    expect(fake.calls.createPerson).toEqual([
      {
        name: { firstName: 'Jane', lastName: 'Doe' },
        emails: { primaryEmail: 'jane.doe@example.com', additionalEmails: [] },
        phones: { primaryPhoneNumber: '5125550142', primaryPhoneCountryCode: 'US', primaryPhoneCallingCode: '+1', additionalPhones: [] },
        location: { addressCountry: 'United States', addressState: 'Texas', addressCity: 'Austin' },
        education: 'BSc Computer Science',
        linkedinLink: { primaryLinkUrl: 'https://linkedin.com/in/jane-doe', primaryLinkLabel: '', secondaryLinks: [] },
      },
    ]);
    expect(fake.calls.createApplication).toHaveLength(1);
    expect(fake.calls.createApplication[0]).toMatchObject({
      name: 'Jane Doe - UI/UX Design Intern, Finance Intern',
      siteId: SITES[1]!.id,
      siteStatus: 'KNOWN',
      submissionKey: KEY,
      positionAppliedFor: ['UI_UX_DESIGN_INTERN', 'FINANCE_INTERN'],
      source: 'REFERRAL',
      referralName: 'Ange Tchakoute',
      safeSenderConfirmed: true,
      submittedAt: NOW.toISOString(),
      sourceFormId: 'application',
      formVersion: '1',
      consentVersion: 'application-consent-v1',
      communicationConsent: false,
      phoneMessagingConsent: false,
      lifecycleStage: 'INTERESTED',
      leadStatus: 'UNCONTACTED',
    });
    expect(fake.people).toHaveLength(1);
    expect(fake.calls.createApplication[0]!.personId).toBe(fake.people[0]!.id);
  });

  it('stores consent timestamps only for the boxes that were ticked', async () => {
    const fake = fakeTwenty();
    await run(fake, undefined, data({ marketingOptIn: true, smsOptIn: false })).promise;
    const app = fake.calls.createApplication[0]!;
    expect(app.communicationConsent).toBe(true);
    expect(app.communicationConsentAt).toBe(NOW.toISOString());
    expect(app.phoneMessagingConsent).toBe(false);
    expect(app).not.toHaveProperty('phoneMessagingConsentAt');
  });
});

describe('submitApplication: Site resolution (approved 2026-10-24)', () => {
  const siteFields = async (siteKey: string | undefined) => {
    const fake = fakeTwenty();
    await run(fake, siteKey).promise;
    const { siteId, siteStatus, siteKeyReceived } = fake.calls.createApplication[0]!;
    return { siteId, siteStatus, siteKeyReceived };
  };

  it('links an active Site and marks it KNOWN', async () => {
    expect(await siteFields('robocollective')).toEqual({ siteId: SITES[1]!.id, siteStatus: 'KNOWN', siteKeyReceived: 'robocollective' });
  });

  it.each([undefined, '', '   '])('leaves the Site empty and marks MISSING when the key is %j', async (siteKey) => {
    expect(await siteFields(siteKey)).toEqual({ siteId: undefined, siteStatus: 'MISSING', siteKeyReceived: undefined });
  });

  it.each(['not_a_site', 'Robo Collective!'])('leaves the Site empty and marks UNKNOWN for %j, keeping the key', async (siteKey) => {
    expect(await siteFields(siteKey)).toEqual({ siteId: undefined, siteStatus: 'UNKNOWN', siteKeyReceived: siteKey });
  });

  it('links an inactive Site and marks it INACTIVE', async () => {
    expect(await siteFields('flomad')).toEqual({ siteId: SITES[2]!.id, siteStatus: 'INACTIVE', siteKeyReceived: 'flomad' });
  });

  it('stores at most 64 characters of the received key', async () => {
    const { siteKeyReceived } = await siteFields('x'.repeat(200));
    expect(siteKeyReceived).toHaveLength(64);
  });
});

describe('submitApplication: existing Person (fill-empty rule)', () => {
  const stored: Person = {
    id: '00000000-0000-4000-8000-0000000000aa',
    name: { firstName: 'Janet', lastName: '' },
    emails: { primaryEmail: 'jane.doe@example.com', additionalEmails: [] },
    phones: { primaryPhoneNumber: '', primaryPhoneCountryCode: '', primaryPhoneCallingCode: '+1', additionalPhones: [] },
    location: { addressStreet1: '1 Main St', addressCity: 'Dallas', addressState: '', addressCountry: '', addressPostcode: '75001' },
    linkedinLink: { primaryLinkUrl: 'https://linkedin.com/in/janet', primaryLinkLabel: '', secondaryLinks: [] },
    education: null,
  };

  it('fills only empty fields and never overwrites stored values', async () => {
    const fake = fakeTwenty({ people: [stored] });
    await run(fake).promise;

    expect(fake.calls.createPerson).toEqual([]);
    expect(fake.calls.updatePerson).toEqual([
      {
        id: stored.id,
        input: {
          name: { firstName: 'Janet', lastName: 'Doe' },
          phones: { primaryPhoneNumber: '5125550142', primaryPhoneCountryCode: 'US', primaryPhoneCallingCode: '+1', additionalPhones: [] },
          // City and street are kept; only the empty state and country are filled.
          location: { addressStreet1: '1 Main St', addressCity: 'Dallas', addressState: 'Texas', addressCountry: 'United States', addressPostcode: '75001' },
          education: 'BSc Computer Science',
        },
      },
    ]);
    expect(fake.calls.createApplication[0]!.personId).toBe(stored.id);
  });

  it('does not update the Person when every field already has a value', async () => {
    const complete: Person = {
      ...stored,
      name: { firstName: 'Janet', lastName: 'Doe' },
      phones: { primaryPhoneNumber: '2145550100', primaryPhoneCountryCode: 'US', primaryPhoneCallingCode: '+1' },
      location: { addressCity: 'Dallas', addressState: 'Texas', addressCountry: 'United States' },
      education: 'MBA',
    };
    const fake = fakeTwenty({ people: [complete] });
    await run(fake).promise;
    expect(fake.calls.updatePerson).toEqual([]);
    expect(fake.calls.createApplication).toHaveLength(1);
  });
});

describe('submitApplication: idempotency', () => {
  it('returns the original Application for a repeated submissionKey and writes nothing', async () => {
    const fake = fakeTwenty({ applications: [{ id: '00000000-0000-4000-8000-0000000000bb', submissionKey: KEY }] });
    const result = await run(fake).promise;
    expect(result).toEqual({ applicationId: '00000000-0000-4000-8000-0000000000bb', duplicate: true });
    expect([fake.calls.createPerson, fake.calls.updatePerson, fake.calls.createApplication]).toEqual([[], [], []]);
  });

  it('a retry after success returns the same Application', async () => {
    const fake = fakeTwenty();
    const first = await run(fake).promise;
    const second = await run(fake).promise;
    expect(second).toEqual({ applicationId: first.applicationId, duplicate: true });
    expect(fake.calls.createApplication).toHaveLength(1);
  });
});

describe('submitApplication: logging', () => {
  it('logs record ids only, never personal data', async () => {
    const fake = fakeTwenty();
    const { promise, lines } = run(fake, 'robocollective');
    await promise;
    const output = lines.join('\n');
    for (const pii of ['jane.doe', 'Jane', 'Doe', '5125550142', 'Austin', 'Ange', 'linkedin']) {
      expect(output).not.toContain(pii);
    }
    expect(lines.map((l) => JSON.parse(l).event)).toEqual(['person.created', 'application.created']);
  });
});
