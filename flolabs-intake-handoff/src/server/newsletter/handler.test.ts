import { describe, expect, it } from 'vitest';
import { captureLogger, fakeTwenty } from '../applications/fake-twenty';
import { createRateLimiter } from '../rate-limit';
import type { Person } from '../twenty/types';
import type { VerifyHuman } from '../turnstile';
import { createNewsletterHandler } from './handler';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const body = {
  submissionKey: '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b',
  email: ' Jane.Doe@Example.com ',
  site: 'robocollective',
  turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
};

const post = (payload: unknown) =>
  new Request('http://localhost/api/newsletter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

function setup(people: Person[] = [], verifyHuman: VerifyHuman = async () => ({ ok: true })) {
  const fake = fakeTwenty({ people });
  const { logger, lines } = captureLogger();
  const handle = createNewsletterHandler({
    twenty: fake.twenty,
    logger,
    now: () => NOW,
    verifyHuman,
    ipLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    emailLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
  });
  return { handle, fake, lines };
}

const consent = {
  communicationConsent: true,
  communicationConsentAt: NOW.toISOString(),
  consentVersion: 'newsletter-consent-v1',
  communicationConsentSite: 'robocollective',
};

describe('POST /api/newsletter', () => {
  it('creates a Person with only the email and the consent record', async () => {
    const { handle, fake } = setup();
    const res = await handle(post(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subscribed: true });
    expect(fake.calls.createPerson).toEqual([{ emails: { primaryEmail: 'jane.doe@example.com', additionalEmails: [] }, ...consent }]);
  });

  it('records consent on an existing Person without touching other fields', async () => {
    const existing: Person = {
      id: '00000000-0000-4000-8000-0000000000aa',
      name: { firstName: 'Jane', lastName: 'Doe' },
      emails: { primaryEmail: 'jane.doe@example.com', additionalEmails: [] },
      phones: null,
      location: null,
      linkedinLink: null,
      education: 'MBA',
      communicationConsent: false,
    };
    const { handle, fake } = setup([existing]);
    await handle(post(body));
    expect(fake.calls.createPerson).toEqual([]);
    expect(fake.calls.updatePerson).toEqual([{ id: existing.id, input: consent }]);
  });

  it('re-subscribing is a no-op and gives the same reply', async () => {
    const { handle, fake } = setup();
    const first = await handle(post(body));
    const second = await handle(post({ ...body, submissionKey: '9d1c2b3a-4e5f-4a6b-8c7d-0e1f2a3b4c5d' }));
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await second.json()).toEqual({ subscribed: true });
    expect(fake.calls.createPerson).toHaveLength(1);
    expect(fake.calls.updatePerson).toEqual([]);
  });

  it('two simultaneous sign-ups for one email create one Person', async () => {
    const { handle, fake } = setup();
    await Promise.all([handle(post(body)), handle(post(body))]);
    expect(fake.calls.createPerson).toHaveLength(1);
  });

  it('rejects an invalid email with the field message', async () => {
    const { handle } = setup();
    const res = await handle(post({ ...body, email: 'jane@' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields.email).toMatch(/valid email/);
  });

  it('refuses an inactive site and a failed bot check, writing nothing', async () => {
    const inactive = setup();
    expect((await inactive.handle(post({ ...body, site: 'flomad' }))).status).toBe(403);
    const bot = setup([], async () => ({ ok: false, code: 'TURNSTILE_REJECTED' }));
    expect((await bot.handle(post(body))).status).toBe(403);
    expect([...inactive.fake.calls.createPerson, ...bot.fake.calls.createPerson]).toEqual([]);
  });

  it('never logs the email', async () => {
    const { handle, lines } = setup();
    await handle(post(body));
    expect(lines.join('\n')).not.toMatch(/jane|example\.com/i);
  });
});
