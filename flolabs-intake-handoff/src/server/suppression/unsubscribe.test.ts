import { describe, expect, it, vi } from 'vitest';
import type { Person } from '../twenty/types';
import { createLogger } from '../logger';
import { createRateLimiter } from '../rate-limit';
import { createTestSuppressionStore } from './test-store';
import { checkMarketingEligibility } from './eligibility';
import { createUnsubscribeHandler } from './unsubscribe-handler';
import { unsubscribePerson } from './unsubscribe';
import { createUnsubscribeToken, createUnsubscribeUrl } from './unsubscribe-token';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const PERSON_ID = '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b';
const person: Person = {
  id: PERSON_ID,
  name: null,
  emails: { primaryEmail: ' Person@Example.com ', additionalEmails: [] },
  phones: null,
  location: null,
  linkedinLink: null,
  education: null,
  communicationConsent: true,
};

function setup(initial = person) {
  let current = initial;
  const store = createTestSuppressionStore();
  const updatePerson = vi.fn(async (_id: string, input: Partial<Person>) => {
    current = { ...current, ...input };
    return { id: PERSON_ID };
  });
  const findPersonById = vi.fn(async () => current);
  const findPersonByEmail = vi.fn(async () => current);
  const logLines: string[] = [];
  return {
    store,
    updatePerson,
    findPersonById,
    findPersonByEmail,
    logLines,
    deps: {
      secret: SECRET,
      people: { findPersonById, updatePerson },
      suppressions: store,
      logger: createLogger((line) => logLines.push(line)),
      now: () => new Date('2026-10-26T10:00:00.000Z'),
    },
  };
}

describe('signed unsubscribe', () => {
  it('places the capability in the HTTPS URL fragment, not the request path or query', () => {
    const url = new URL(createUnsubscribeUrl('https://forms.example.com/', PERSON_ID, SECRET));
    expect(url.pathname).toBe('/unsubscribe');
    expect(url.search).toBe('');
    expect(url.hash.slice(1)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(() => createUnsubscribeUrl('http://forms.example.com/', PERSON_ID, SECRET)).toThrow('UNSUBSCRIBE_BASE_URL_INVALID');
  });

  it('persists suppression before changing only the Person marketing consent flag', async () => {
    const test = setup();
    const result = await unsubscribePerson(createUnsubscribeToken(PERSON_ID, SECRET), test.deps);
    expect(result).toEqual({ ok: true, repeated: false });
    expect(test.store.entries[0]).toMatchObject({
      normalizedEmail: 'person@example.com',
      reason: 'UNSUBSCRIBED',
      scope: 'ALL_MARKETING',
      source: 'UNSUBSCRIBE',
    });
    expect(test.updatePerson).toHaveBeenCalledWith(PERSON_ID, { communicationConsent: false });
    expect(test.logLines.join('\n')).not.toContain('example.com');
  });

  it('is idempotent for repeated requests and does not erase the original consent timestamp', async () => {
    const test = setup({ ...person, communicationConsent: false, communicationConsentAt: '2026-01-01T00:00:00.000Z' });
    const token = createUnsubscribeToken(PERSON_ID, SECRET);
    await expect(unsubscribePerson(token, test.deps)).resolves.toEqual({ ok: true, repeated: true });
    await expect(unsubscribePerson(token, test.deps)).resolves.toEqual({ ok: true, repeated: true });
    expect(test.store.entries).toHaveLength(1);
    expect(test.updatePerson).not.toHaveBeenCalled();
    expect(test.findPersonById).toHaveBeenCalledTimes(2);
  });

  it('blocks the recipient from marketing after unsubscribe', async () => {
    const test = setup();
    await unsubscribePerson(createUnsubscribeToken(PERSON_ID, SECRET), test.deps);
    await expect(
      checkMarketingEligibility('person@example.com', 'newsletter', {
        people: { findPersonByEmail: test.findPersonByEmail },
        suppressions: test.store,
      }),
    ).resolves.toEqual({ allowed: false, reason: 'NO_CONSENT' });
  });

  it('still blocks marketing with the durable suppression if the CRM update is unavailable', async () => {
    const test = setup();
    test.updatePerson.mockRejectedValue(new Error('private CRM error'));
    await unsubscribePerson(createUnsubscribeToken(PERSON_ID, SECRET), test.deps);
    await expect(
      checkMarketingEligibility('person@example.com', 'newsletter', {
        people: { findPersonByEmail: test.findPersonByEmail },
        suppressions: test.store,
      }),
    ).resolves.toEqual({ allowed: false, reason: 'SUPPRESSED' });
  });

  it('rejects tampered tokens without looking up or mutating a Person', async () => {
    const test = setup();
    const result = await unsubscribePerson('tampered.token', test.deps);
    expect(result).toEqual({ ok: false, code: 'INVALID_TOKEN' });
    expect(test.findPersonById).not.toHaveBeenCalled();
    expect(test.store.entries).toHaveLength(0);
  });

  it('returns unavailable after persisting suppression if the CRM update fails', async () => {
    const test = setup();
    test.updatePerson.mockRejectedValue(new Error('private CRM error'));
    const result = await unsubscribePerson(createUnsubscribeToken(PERSON_ID, SECRET), test.deps);
    expect(result).toEqual({ ok: false, code: 'UNAVAILABLE' });
    expect(test.store.entries).toHaveLength(1);
    expect(test.logLines.join('\n')).not.toContain('example.com');
  });
});

describe('POST /api/unsubscribe handler', () => {
  it('requires same-origin POST and limits abusive requests', async () => {
    const test = setup();
    const handle = createUnsubscribeHandler({
      ...test.deps,
      ipLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
      trustedIpHeader: 'x-real-ip',
    });
    const token = createUnsubscribeToken(PERSON_ID, SECRET);
    const request = (origin: string) =>
      new Request('https://forms.example.com/api/unsubscribe', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json', 'x-real-ip': '203.0.113.1' },
        body: JSON.stringify({ token }),
      });
    expect((await handle(request('https://attacker.example'))).status).toBe(403);
    expect((await handle(request('https://forms.example.com'))).status).toBe(200);
    expect((await handle(request('https://forms.example.com'))).status).toBe(429);
  });

  it('accepts repeated valid requests idempotently', async () => {
    const test = setup();
    const handle = createUnsubscribeHandler({
      ...test.deps,
      ipLimiter: createRateLimiter({ limit: 5, windowMs: 60_000 }),
      trustedIpHeader: 'x-real-ip',
    });
    const token = createUnsubscribeToken(PERSON_ID, SECRET);
    const request = () =>
      new Request('https://forms.example.com/api/unsubscribe', {
        method: 'POST',
        headers: { origin: 'https://forms.example.com', 'content-type': 'application/json', 'x-real-ip': '203.0.113.2' },
        body: JSON.stringify({ token }),
      });
    expect((await handle(request())).status).toBe(200);
    expect((await handle(request())).status).toBe(200);
    expect(test.store.entries).toHaveLength(1);
  });
});
