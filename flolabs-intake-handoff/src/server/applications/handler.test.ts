import { describe, expect, it } from 'vitest';
import { CV_MESSAGES, MAX_CV_BYTES } from '@/shared/forms/cv';
import { TwentyError } from '../twenty/client';
import { captureLogger, fakeTwenty } from './fake-twenty';
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
};

function multipart(data: unknown, cv: File | null = file(PDF_BYTES, 'Jane Doe CV.pdf', 'application/pdf')) {
  const form = new FormData();
  if (data !== undefined) form.set('data', typeof data === 'string' ? data : JSON.stringify(data));
  if (cv) form.set('cv', cv);
  return new Request('http://localhost/api/applications', { method: 'POST', body: form });
}

function setup(fake = fakeTwenty(), twenty = fake.twenty) {
  const { logger, lines } = captureLogger();
  return { handle: createApplicationsHandler({ twenty, logger }), fake, lines };
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
