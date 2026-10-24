import { describe, expect, it } from 'vitest';
import { CV_MESSAGES, MAX_CV_BYTES } from '@/shared/forms/cv';
import { TwentyError } from '../twenty/client';
import { captureLogger, fakeTwenty } from './fake-twenty';
import { createRateLimiter } from '../rate-limit';
import type { VerifyHuman } from '../turnstile';
import { createApplicationsHandler } from './handler';
import { EXE_BYTES, file, PDF_BYTES } from './test-files';

const fields = {
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
  site: 'robocollective',
  turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
};

function multipart(data: unknown, cv: File | null = file(PDF_BYTES, 'Jane Doe CV.pdf', 'application/pdf')) {
  const form = new FormData();
  if (data !== undefined) form.set('data', typeof data === 'string' ? data : JSON.stringify(data));
  if (cv) form.set('cv', cv);
  return new Request('http://localhost/api/applications', { method: 'POST', body: form });
}

const humanOk: VerifyHuman = async () => ({ ok: true });

function setup(
  fake = fakeTwenty(),
  twenty = fake.twenty,
  options: { verifyHuman?: VerifyHuman; ipLimit?: number; emailLimit?: number } = {},
) {
  const { logger, lines } = captureLogger();
  const handle = createApplicationsHandler({
    twenty,
    logger,
    verifyHuman: options.verifyHuman ?? humanOk,
    ipLimiter: createRateLimiter({ limit: options.ipLimit ?? 100, windowMs: 60_000 }),
    emailLimiter: createRateLimiter({ limit: options.emailLimit ?? 100, windowMs: 60_000 }),
  });
  return { handle, fake, lines };
}

describe('POST /api/applications', () => {
  it('returns 201 with the new Application id and stores the CV', async () => {
    const { handle, fake } = setup();
    const res = await handle(multipart(fields));
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(fake.calls.createApplication).toHaveLength(1);
    expect(fake.calls.uploadFile).toHaveLength(1);
    expect(await res.json()).toEqual({ applicationId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  });

  it('returns 200 with the same id for a repeated submission', async () => {
    const { handle } = setup();
    const first = await (await handle(multipart(fields))).json();
    const res = await handle(multipart(fields));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(first);
  });

  it('returns 400 with field messages, including the CV, for invalid input', async () => {
    const { handle, fake } = setup();
    const res = await handle(multipart({ ...fields, email: 'nope', source: 'OTHER' }, null));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_FAILED');
    expect(json.error.fields).toMatchObject({ email: expect.any(String), sourceDetail: expect.any(String), cv: CV_MESSAGES.missing });
    expect(fake.calls.uploadFile).toEqual([]);
    expect(fake.calls.createApplication).toEqual([]);
  });

  it('rejects a renamed .exe and writes nothing', async () => {
    const { handle, fake } = setup();
    const res = await handle(multipart(fields, file(EXE_BYTES, 'cv.pdf', 'application/pdf')));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toEqual({ cv: CV_MESSAGES.type });
    expect([fake.calls.uploadFile, fake.calls.createPerson, fake.calls.createApplication]).toEqual([[], [], []]);
  });

  it('stops reading a huge body sent without Content-Length (chunked), before any Twenty call', async () => {
    const { handle, fake } = setup();
    let sent = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk); // never closes: only a capped reader can finish
      },
    });
    const req = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=x' },
      body: endless,
      duplex: 'half',
    } as RequestInit);
    const res = await handle(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toEqual({ cv: CV_MESSAGES.tooLarge });
    expect(sent).toBeLessThan(MAX_CV_BYTES + 4 * 1024 * 1024);
    expect(fake.calls.order).toEqual([]);
  });

  it('rejects a CV over 5 MB', async () => {
    const big = new Uint8Array(MAX_CV_BYTES + 10);
    big.set(PDF_BYTES);
    const { handle } = setup();
    const res = await handle(multipart(fields, file(big, 'cv.pdf')));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toEqual({ cv: CV_MESSAGES.tooLarge });
  });

  it.each([
    ['malformed JSON in data', () => multipart('{"firstName":')],
    ['missing data part', () => multipart(undefined)],
    ['a JSON array', () => multipart([fields])],
    ['oversized data', () => multipart({ ...fields, education: 'x'.repeat(40_000) })],
    [
      'a JSON request (multipart required)',
      () =>
        new Request('http://localhost/api/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        }),
    ],
  ])('rejects %s with a generic 400', async (_case, makeRequest) => {
    const { handle, fake } = setup();
    const res = await handle(makeRequest());
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_FAILED');
    expect(fake.calls.uploadFile).toEqual([]);
  });

  it('returns a generic 502 when Twenty fails, and logs only codes', async () => {
    const fake = fakeTwenty();
    const failing = {
      ...fake.twenty,
      createApplication: async () => {
        throw new TwentyError('twenty.createApplication', 400, 'BAD_USER_INPUT');
      },
    };
    const { handle, lines } = setup(fake, failing);
    const res = await handle(multipart(fields));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { code: 'UPSTREAM_UNAVAILABLE', message: 'We could not save your submission right now. Please try again later.' },
    });
    const failure = JSON.parse(lines.at(-1)!);
    expect(failure).toMatchObject({ event: 'application.failed', code: 'BAD_USER_INPUT', op: 'twenty.createApplication', status: 400 });
    expect(lines.join('\n')).not.toMatch(/jane\.doe|Jane Doe CV/);
  });
});

describe('POST /api/applications: bot check and rate limits (T7)', () => {
  it('rejects a failed Turnstile check with 403 and makes no Twenty call', async () => {
    const fake = fakeTwenty();
    const { handle, lines } = setup(fake, fake.twenty, { verifyHuman: async () => ({ ok: false, code: 'TURNSTILE_invalid-input-response' }) });
    const res = await handle(multipart(fields));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('BOT_CHECK_FAILED');
    expect([fake.calls.uploadFile, fake.calls.createPerson, fake.calls.createApplication]).toEqual([[], [], []]);
    expect(lines.some((l) => JSON.parse(l).code === 'TURNSTILE_invalid-input-response')).toBe(true);
  });

  it('passes the token and client IP to the verifier', async () => {
    const seen: unknown[] = [];
    const { handle } = setup(fakeTwenty(), undefined, {
      verifyHuman: async (token, ip) => {
        seen.push(token, ip);
        return { ok: true };
      },
    });
    await handle(multipart(fields));
    expect(seen).toEqual(['XXXX.DUMMY.TOKEN.XXXX', undefined]);
  });

  it('does not spend a Turnstile check on invalid input', async () => {
    let calls = 0;
    const { handle } = setup(fakeTwenty(), undefined, {
      verifyHuman: async () => {
        calls++;
        return { ok: true };
      },
    });
    await handle(multipart({ ...fields, email: 'nope' }));
    expect(calls).toBe(0);
  });

  it('returns 429 with Retry-After once the per-IP limit is reached, before reading the body', async () => {
    const fake = fakeTwenty();
    const { handle } = setup(fake, fake.twenty, { ipLimit: 2 });
    await handle(multipart({ ...fields, email: 'nope' }));
    await handle(multipart({ ...fields, email: 'nope' }));
    const res = await handle(multipart(fields));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await res.json()).error.code).toBe('RATE_LIMITED');
    expect(fake.calls.createApplication).toEqual([]);
  });

  it('returns 429 once the per-email limit is reached', async () => {
    const { handle } = setup(fakeTwenty(), undefined, { emailLimit: 1 });
    expect((await handle(multipart(fields))).status).toBe(201);
    const res = await handle(multipart({ ...fields, submissionKey: '9d1c2b3a-4e5f-4a6b-8c7d-0e1f2a3b4c5d' }));
    expect(res.status).toBe(429);
  });

  it('creates one Application when the same submission arrives twice at the same time', async () => {
    const { handle, fake } = setup();
    const [a, b] = await Promise.all([handle(multipart(fields)), handle(multipart(fields))]);
    expect(fake.calls.createApplication).toHaveLength(1);
    expect(fake.calls.uploadFile).toHaveLength(1);
    expect((await a.json()).applicationId).toBe((await b.json()).applicationId);
  });
});

