import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { createLinkToken, formLinkUrl, LINK_VALIDITY_DAYS, verifyLinkToken } from './link-tokens';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const APP = '7ca6ccf2-2aa0-478b-a76d-c655a6f2037f';
const DAY_MS = 24 * 60 * 60 * 1000;
const ISSUED = new Date('2026-10-01T09:00:00Z');

/** A correctly signed token with any payload, to test values createLinkToken never produces. */
const signed = (payload: object) => {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${createHmac('sha256', SECRET).update(data).digest('base64url')}`;
};

describe('link tokens (T10)', () => {
  it('round-trips the Application id and form type', () => {
    const token = createLinkToken({ applicationId: APP, formType: 'CONTACTED' }, SECRET);
    expect(verifyLinkToken(token, SECRET, 'CONTACTED')).toEqual({ ok: true, applicationId: APP, formType: 'CONTACTED' });
  });

  describe(`expiry (${LINK_VALIDITY_DAYS} days)`, () => {
    const token = createLinkToken({ applicationId: APP, formType: 'MASTERCLASS' }, SECRET, ISSUED);
    const after = (ms: number) => new Date(ISSUED.getTime() + ms);

    it('is 21 days', () => expect(LINK_VALIDITY_DAYS).toBe(21));

    it('is valid from issue up to exactly 21 days later', () => {
      expect(verifyLinkToken(token, SECRET, 'MASTERCLASS', after(0)).ok).toBe(true);
      expect(verifyLinkToken(token, SECRET, 'MASTERCLASS', after(21 * DAY_MS - 1000)).ok).toBe(true);
      expect(verifyLinkToken(token, SECRET, 'MASTERCLASS', after(21 * DAY_MS)).ok).toBe(true);
    });

    it('is expired after 21 days', () => {
      expect(verifyLinkToken(token, SECRET, 'MASTERCLASS', after(21 * DAY_MS + 1000))).toEqual({ ok: false, code: 'EXPIRED' });
      expect(verifyLinkToken(token, SECRET, 'MASTERCLASS', after(400 * DAY_MS))).toEqual({ ok: false, code: 'EXPIRED' });
    });

    it('checks the signature and the form before the date', () => {
      const late = after(30 * DAY_MS);
      expect(verifyLinkToken(`${token.slice(0, -2)}AA`, SECRET, 'MASTERCLASS', late)).toEqual({ ok: false, code: 'BAD_SIGNATURE' });
      expect(verifyLinkToken(token, SECRET, 'CONTACTED', late)).toEqual({ ok: false, code: 'WRONG_FORM' });
    });

    it.each([
      ['missing', undefined],
      ['a string', '1759309200'],
      ['a fraction', 1759309200.5],
      ['zero', 0],
      ['negative', -1],
      ['too large', Number.MAX_SAFE_INTEGER + 1],
    ])('rejects an issued-at that is %s as malformed', (_label, i) => {
      expect(verifyLinkToken(signed({ v: 1, a: APP, f: 'CONTACTED', i }), SECRET, 'CONTACTED', ISSUED)).toEqual({ ok: false, code: 'MALFORMED' });
    });

    it('allows a few minutes of clock difference but rejects an issued-at in the future as malformed', () => {
      const at = (offsetSeconds: number) => signed({ v: 1, a: APP, f: 'CONTACTED', i: ISSUED.getTime() / 1000 + offsetSeconds });
      expect(verifyLinkToken(at(60), SECRET, 'CONTACTED', ISSUED).ok).toBe(true);
      expect(verifyLinkToken(at(3600), SECRET, 'CONTACTED', ISSUED)).toEqual({ ok: false, code: 'MALFORMED' });
    });
  });

  it('rejects a token for another form', () => {
    const token = createLinkToken({ applicationId: APP, formType: 'CONTACTED' }, SECRET);
    expect(verifyLinkToken(token, SECRET, 'BEFORE_MEETING')).toEqual({ ok: false, code: 'WRONG_FORM' });
  });

  it('rejects a tampered payload (e.g. another Application id)', () => {
    const token = createLinkToken({ applicationId: APP, formType: 'CONTACTED' }, SECRET);
    const [, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, a: '503ae559-7e05-42b7-8c79-dc3632633b2f', f: 'CONTACTED', i: 0 })).toString('base64url');
    expect(verifyLinkToken(`${forged}.${signature}`, SECRET, 'CONTACTED')).toEqual({ ok: false, code: 'BAD_SIGNATURE' });
  });

  it('rejects a tampered signature and a token signed with another secret (secret rotation revokes links)', () => {
    const token = createLinkToken({ applicationId: APP, formType: 'CONTACTED' }, SECRET);
    expect(verifyLinkToken(`${token.slice(0, -2)}AA`, SECRET, 'CONTACTED')).toEqual({ ok: false, code: 'BAD_SIGNATURE' });
    expect(verifyLinkToken(token, 'another-secret-'.padEnd(48, 'y'), 'CONTACTED')).toEqual({ ok: false, code: 'BAD_SIGNATURE' });
  });

  it.each([undefined, '', 'abc', 'a.b.c', 42, 'x'.repeat(600)])('rejects malformed input %j', (token) => {
    expect(verifyLinkToken(token, SECRET, 'CONTACTED')).toMatchObject({ ok: false });
  });

  it('refuses to sign anything but a UUID and a known form', () => {
    expect(() => createLinkToken({ applicationId: 'not-a-uuid', formType: 'CONTACTED' }, SECRET)).toThrow();
    // @ts-expect-error unknown form type
    expect(() => createLinkToken({ applicationId: APP, formType: 'SURVEY' }, SECRET)).toThrow();
  });

  it('builds the link with the form path', () => {
    const url = new URL(formLinkUrl('https://forms.flolabsinnovations.com', { applicationId: APP, formType: 'BEFORE_MEETING' }, SECRET));
    expect(url.pathname).toBe('/before-meeting');
    expect(verifyLinkToken(url.searchParams.get('t'), SECRET, 'BEFORE_MEETING').ok).toBe(true);
  });
});
