import { describe, expect, it } from 'vitest';
import { captureLogger, fakeTwenty } from '../applications/fake-twenty';
import { TwentyError } from '../twenty/client';
import { createLinkToken } from './link-tokens';
import { openFormLink } from './open-link';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const APP = '00000000-0000-4000-8000-0000000000a1';
const token = (formType: 'CONTACTED' | 'BEFORE_MEETING' = 'CONTACTED', applicationId = APP) =>
  createLinkToken({ applicationId, formType }, SECRET);

function setup(formSubmissions: { id: string; applicationId: string; formType: string }[] = []) {
  const fake = fakeTwenty({ applications: [{ id: APP, submissionKey: 'k' }], formSubmissions });
  const { logger, lines } = captureLogger();
  return { deps: { twenty: fake.twenty, logger, secret: SECRET }, lines, fake };
}

describe('openFormLink (T10)', () => {
  it('opens a valid, unused link', async () => {
    const { deps } = setup();
    expect(await openFormLink(token(), 'CONTACTED', deps)).toMatchObject({ ok: true, application: { id: APP } });
  });

  it('refuses a link that was already used for this form', async () => {
    const { deps } = setup([{ id: '00000000-0000-4000-8000-0000000000f1', applicationId: APP, formType: 'CONTACTED' }]);
    expect(await openFormLink(token(), 'CONTACTED', deps)).toEqual({ ok: false, reason: 'USED' });
  });

  it('a used Form 1 does not block Form 2', async () => {
    const { deps } = setup([{ id: '00000000-0000-4000-8000-0000000000f1', applicationId: APP, formType: 'CONTACTED' }]);
    expect((await openFormLink(token('BEFORE_MEETING'), 'BEFORE_MEETING', deps)).ok).toBe(true);
  });

  it('refuses tampered or wrong-form links as INVALID', async () => {
    const { deps } = setup();
    expect(await openFormLink(`${token()}x`, 'CONTACTED', deps)).toEqual({ ok: false, reason: 'INVALID' });
    expect(await openFormLink(token('CONTACTED'), 'BEFORE_MEETING', deps)).toEqual({ ok: false, reason: 'INVALID' });
    expect(await openFormLink(undefined, 'CONTACTED', deps)).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('reports a deleted Application as NOT_FOUND', async () => {
    const { deps } = setup();
    expect(await openFormLink(token('CONTACTED', '00000000-0000-4000-8000-0000000000ff'), 'CONTACTED', deps)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });

  it('shows UNAVAILABLE when Twenty fails or the secret is not configured, and logs only codes', async () => {
    const { deps, lines } = setup();
    const failing = {
      ...deps,
      twenty: {
        ...deps.twenty,
        findFormSubmissionFor: async () => {
          throw new TwentyError('twenty.findFormSubmissionFor', 200, 'FORBIDDEN');
        },
      },
    };
    expect(await openFormLink(token(), 'CONTACTED', failing)).toEqual({ ok: false, reason: 'UNAVAILABLE' });
    expect(await openFormLink(token(), 'CONTACTED', { ...deps, secret: undefined })).toEqual({ ok: false, reason: 'UNAVAILABLE' });
    expect(lines.map((l) => JSON.parse(l).code)).toEqual(['FORBIDDEN', 'LINK_TOKEN_SECRET_MISSING']);
  });
});
