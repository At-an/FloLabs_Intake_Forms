import { describe, expect, it } from 'vitest';
import { createLinkToken, formLinkUrl, verifyLinkToken } from './link-tokens';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const APP = '7ca6ccf2-2aa0-478b-a76d-c655a6f2037f';

describe('link tokens (T10)', () => {
  it('round-trips the Application id and form type', () => {
    const token = createLinkToken({ applicationId: APP, formType: 'CONTACTED' }, SECRET);
    expect(verifyLinkToken(token, SECRET, 'CONTACTED')).toEqual({ ok: true, applicationId: APP, formType: 'CONTACTED' });
  });

  it('never expires: a token issued years ago still verifies', () => {
    const token = createLinkToken({ applicationId: APP, formType: 'MASTERCLASS' }, SECRET, new Date('2020-01-01'));
    expect(verifyLinkToken(token, SECRET, 'MASTERCLASS').ok).toBe(true);
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
