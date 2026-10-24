import { describe, expect, it } from 'vitest';
import { captureLogger, fakeTwenty, SITES } from '../applications/fake-twenty';
import { createRateLimiter } from '../rate-limit';
import type { VerifyHuman } from '../turnstile';
import { createInquiriesHandler } from './handler';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const body = {
  submissionKey: '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'Jane.Doe@Example.com',
  subject: 'Partnership question',
  message: 'Hello, we would like to talk about a partnership.',
  site: 'robocollective',
  turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
};

const post = (payload: unknown) =>
  new Request('http://localhost/api/inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

function setup(options: { verifyHuman?: VerifyHuman; ipLimit?: number } = {}) {
  const fake = fakeTwenty();
  const { logger, lines } = captureLogger();
  const handle = createInquiriesHandler({
    twenty: fake.twenty,
    logger,
    now: () => NOW,
    verifyHuman: options.verifyHuman ?? (async () => ({ ok: true })),
    ipLimiter: createRateLimiter({ limit: options.ipLimit ?? 100, windowMs: 60_000 }),
    emailLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
  });
  return { handle, fake, lines };
}

describe('POST /api/inquiries (Contact Us)', () => {
  it('creates the Person and one Inquiry with Site, status New and site status Known', async () => {
    const { handle, fake } = setup();
    const res = await handle(post(body));
    expect(res.status).toBe(201);
    expect(fake.calls.createPerson).toEqual([
      { emails: { primaryEmail: 'jane.doe@example.com', additionalEmails: [] }, name: { firstName: 'Jane', lastName: 'Doe' } },
    ]);
    expect(fake.calls.createInquiry).toEqual([
      {
        name: 'Jane Doe - Partnership question',
        subject: 'Partnership question',
        message: 'Hello, we would like to talk about a partnership.',
        status: 'NEW',
        submittedAt: NOW.toISOString(),
        submissionKey: body.submissionKey,
        personId: fake.people[0]!.id,
        siteId: SITES[1]!.id,
        siteStatus: 'KNOWN',
        siteKeyReceived: 'robocollective',
      },
    ]);
    expect(await res.json()).toEqual({ inquiryId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  });

  it('returns the original Inquiry for a repeated submission', async () => {
    const { handle, fake } = setup();
    const first = await (await handle(post(body))).json();
    const res = await handle(post(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(first);
    expect(fake.calls.createInquiry).toHaveLength(1);
  });

  it('enforces the message length limit', async () => {
    const { handle } = setup();
    const res = await handle(post({ ...body, message: 'x'.repeat(5001) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toEqual({ message: 'Use 5000 characters or fewer.' });
  });

  it.each([
    ['an unknown website', 'nope', { siteId: undefined, siteStatus: 'UNKNOWN', siteKeyReceived: 'nope' }],
    ['an inactive Site', 'flomad', { siteId: SITES[2]!.id, siteStatus: 'INACTIVE', siteKeyReceived: 'flomad' }],
    ['no site key', undefined, { siteId: undefined, siteStatus: 'MISSING', siteKeyReceived: undefined }],
  ])('accepts %s and marks it (forms may run on future websites)', async (_case, site, expected) => {
    const { handle, fake } = setup();
    const res = await handle(post({ ...body, site }));
    expect(res.status).toBe(201);
    const { siteId, siteStatus, siteKeyReceived } = fake.calls.createInquiry[0]!;
    expect({ siteId, siteStatus, siteKeyReceived }).toEqual(expected);
  });

  it('rejects a failed bot check before any Twenty call', async () => {
    const { handle, fake } = setup({ verifyHuman: async () => ({ ok: false, code: 'TURNSTILE_REJECTED' }) });
    const res = await handle(post(body));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('BOT_CHECK_FAILED');
    expect([fake.calls.createPerson, fake.calls.createInquiry]).toEqual([[], []]);
  });

  it('rate-limits per IP', async () => {
    const { handle } = setup({ ipLimit: 1 });
    await handle(post(body));
    expect((await handle(post(body))).status).toBe(429);
  });

  it('never logs the message, subject, name or email', async () => {
    const { handle, lines } = setup();
    await handle(post(body));
    expect(lines.join('\n')).not.toMatch(/Jane|Doe|example\.com|Partnership|partnership/i);
  });
});
