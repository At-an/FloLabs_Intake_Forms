import { describe, expect, it } from 'vitest';
import { TwentyError } from '../twenty/client';
import { captureLogger, fakeTwenty } from './fake-twenty';
import { createApplicationsHandler } from './handler';

const body = {
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

const post = (payload: unknown, contentType = 'application/json') =>
  new Request('http://localhost/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

function setup(fake = fakeTwenty(), twenty = fake.twenty) {
  const { logger, lines } = captureLogger();
  return { handle: createApplicationsHandler({ twenty, logger }), fake, lines };
}

describe('POST /api/applications', () => {
  it('returns 201 with the new Application id', async () => {
    const { handle, fake } = setup();
    const res = await handle(post(body));
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(fake.calls.createApplication).toHaveLength(1);
    expect(await res.json()).toEqual({ applicationId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  });

  it('returns 200 with the same id for a repeated submission', async () => {
    const { handle } = setup();
    const first = await (await handle(post(body))).json();
    const res = await handle(post(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(first);
  });

  it('returns 400 with field messages from the schema for invalid input', async () => {
    const { handle, fake } = setup();
    const res = await handle(post({ ...body, email: 'nope', source: 'OTHER' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_FAILED');
    expect(json.error.fields).toMatchObject({ email: expect.any(String), sourceDetail: expect.any(String) });
    expect(fake.calls.createApplication).toEqual([]);
  });

  it.each([
    ['malformed JSON', post('{"firstName":', 'application/json')],
    ['a non-JSON content type', post('firstName=Jane', 'application/x-www-form-urlencoded')],
    ['a JSON array', post([body])],
    ['an oversized body', post({ ...body, education: 'x'.repeat(40_000) })],
  ])('rejects %s with a generic 400', async (_case, request) => {
    const { handle } = setup();
    const res = await handle(request);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_FAILED');
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
    const res = await handle(post(body));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { code: 'UPSTREAM_UNAVAILABLE', message: 'We could not save your submission right now. Please try again later.' },
    });
    const failure = JSON.parse(lines.at(-1)!);
    expect(failure).toMatchObject({ event: 'application.failed', code: 'BAD_USER_INPUT', op: 'twenty.createApplication', status: 400 });
    expect(lines.join('\n')).not.toContain('jane.doe');
  });
});
