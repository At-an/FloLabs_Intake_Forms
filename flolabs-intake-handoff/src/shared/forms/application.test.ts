import { describe, expect, it } from 'vitest';
import { applicationSchema, fieldErrors, type ApplicationFormInput } from './application';

const valid: ApplicationFormInput = {
  submissionKey: '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane.doe@example.com',
  phone: { country: 'US', number: '(512) 555-0142' },
  country: 'US',
  city: 'Austin',
  education: 'BSc Computer Science',
  programs: ['UI_UX_DESIGN_INTERN'],
  source: 'LINKEDIN_COM',
  safeSenderConfirmed: true,
};

const parse = (overrides: Partial<Record<keyof ApplicationFormInput, unknown>>) =>
  applicationSchema.safeParse({ ...valid, ...overrides });

const errorsOf = (overrides: Partial<Record<keyof ApplicationFormInput, unknown>>) => {
  const result = parse(overrides);
  return result.success ? {} : fieldErrors(result.error);
};

describe('applicationSchema: valid input and normalization', () => {
  it('accepts a complete application', () => {
    expect(parse({}).success).toBe(true);
  });

  it('lower-cases and trims the email', () => {
    const result = parse({ email: '  Jane.Doe@Example.COM ' });
    expect(result.success && result.data.email).toBe('jane.doe@example.com');
  });

  it('normalizes the phone number to E.164 with country and calling code', () => {
    const result = parse({ phone: { country: 'CM', number: '6 71 23 45 67' } });
    expect(result.success && result.data.phone).toEqual({
      e164: '+237671234567',
      countryCode: 'CM',
      callingCode: '+237',
      nationalNumber: '671234567',
    });
  });

  it('accepts a number already in international format', () => {
    const result = parse({ phone: { country: 'US', number: '+1 512 555 0142' } });
    expect(result.success && result.data.phone.e164).toBe('+15125550142');
  });

  it('trims text fields and turns empty optional fields into undefined', () => {
    const result = parse({ firstName: '  Jane ', state: '   ', linkedinUrl: '' });
    expect(result.success && result.data.firstName).toBe('Jane');
    expect(result.success && result.data.state).toBeUndefined();
    expect(result.success && result.data.linkedinUrl).toBeUndefined();
  });

  it('defaults both opt-ins to false (unchecked)', () => {
    const result = parse({});
    expect(result.success && [result.data.marketingOptIn, result.data.smsOptIn]).toEqual([false, false]);
  });
});

describe('applicationSchema: required fields', () => {
  it.each([
    ['firstName', 'Enter your first name.'],
    ['lastName', 'Enter your last name.'],
    ['email', 'Enter your email address.'],
    ['city', 'Enter your city or town.'],
    ['education', 'Enter your education or major.'],
  ] as const)('requires %s', (field, message) => {
    expect(errorsOf({ [field]: '  ' })[field]).toBe(message);
  });

  it('requires a phone number', () => {
    expect(errorsOf({ phone: { country: 'US', number: ' ' } })['phone.number']).toBe('Enter your phone number.');
  });

  it('requires at least one program and rejects unknown or duplicate ones', () => {
    expect(errorsOf({ programs: [] }).programs).toBe('Choose at least one program.');
    expect(errorsOf({ programs: ['Backend Developer Intern'] }).programs).toBe('Choose a program from the list.');
    expect(errorsOf({ programs: ['FINANCE_INTERN', 'FINANCE_INTERN'] }).programs).toBe(
      'Each program can be chosen only once.',
    );
  });

  it('only accepts API values for the source, not labels', () => {
    expect(errorsOf({ source: 'LinkedIn' }).source).toBe('Tell us how you heard about us.');
  });

  it('requires the safe-sender box to be checked', () => {
    expect(errorsOf({ safeSenderConfirmed: false }).safeSenderConfirmed).toBe('Please confirm you have added hr@flolabsinnovations.com to your contacts.');
  });

  it('rejects unknown country codes', () => {
    expect(errorsOf({ country: 'XX' }).country).toBe('Choose your country or region.');
    expect(errorsOf({ phone: { country: 'United States', number: '5125550142' } })['phone.country']).toMatch(/country code/);
  });

  it('rejects invalid emails and phone numbers', () => {
    expect(errorsOf({ email: 'jane.doe@' }).email).toMatch(/valid email/);
    expect(errorsOf({ phone: { country: 'US', number: '123' } })['phone.number']).toBe(
      'Enter a valid phone number for the chosen country.',
    );
  });

  it('enforces maximum lengths', () => {
    expect(errorsOf({ firstName: 'a'.repeat(101) }).firstName).toBe('Use 100 characters or fewer.');
  });
});

describe('applicationSchema: conditional rules', () => {
  it('requires sourceDetail when the source is Other', () => {
    expect(errorsOf({ source: 'OTHER' }).sourceDetail).toBe('Tell us where you heard about us.');
    expect(parse({ source: 'OTHER', sourceDetail: 'A podcast' }).success).toBe(true);
  });

  it('requires referralName when the source is Referral', () => {
    expect(errorsOf({ source: 'REFERRAL' }).referralName).toBe('Enter the name of the person who referred you.');
    expect(parse({ source: 'REFERRAL', referralName: 'Ange Tchakoute' }).success).toBe(true);
  });

  it('drops sourceDetail and referralName when their source does not apply', () => {
    const result = parse({ source: 'GOOGLE_COM', sourceDetail: 'stale', referralName: 'stale' });
    expect(result.success && [result.data.sourceDetail, result.data.referralName]).toEqual([undefined, undefined]);
  });

  it('reports conditional errors together with other field errors (live inline errors)', () => {
    const errors = errorsOf({ firstName: '', source: 'OTHER', phone: { country: 'US', number: '123' } });
    expect(Object.keys(errors).sort()).toEqual(['firstName', 'phone.number', 'sourceDetail']);
  });

  it('still reports field errors while other fields are missing entirely (fresh, half-filled form)', () => {
    const errors = errorsOf({ source: undefined, programs: undefined, phone: { country: 'US', number: '123' }, linkedinUrl: 'example.com' });
    expect(errors).toMatchObject({
      'phone.number': 'Enter a valid phone number for the chosen country.',
      linkedinUrl: 'Enter a LinkedIn profile link (linkedin.com).',
      source: 'Tell us how you heard about us.',
    });
    expect(errors.programs).toBeDefined();
  });

  it('runs the Other rule even when an unrelated field has a type error', () => {
    expect(errorsOf({ programs: undefined, source: 'OTHER' }).sourceDetail).toBe('Tell us where you heard about us.');
  });
});

describe('applicationSchema: LinkedIn URL', () => {
  it('accepts linkedin.com links, adding https when missing', () => {
    const result = parse({ linkedinUrl: 'linkedin.com/in/jane-doe' });
    expect(result.success && result.data.linkedinUrl).toBe('https://linkedin.com/in/jane-doe');
    const www = parse({ linkedinUrl: 'http://www.linkedin.com/in/jane-doe' });
    expect(www.success && www.data.linkedinUrl).toBe('https://www.linkedin.com/in/jane-doe');
  });

  it('rejects other domains, including look-alikes', () => {
    for (const url of ['https://example.com/in/jane', 'https://linkedin.com.evil.io/in/jane', 'https://notlinkedin.com/in/x']) {
      expect(errorsOf({ linkedinUrl: url }).linkedinUrl).toBe('Enter a LinkedIn profile link (linkedin.com).');
    }
  });
});
