import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Signed links for Forms 1-3 (T10): /<path>?t=<token>, token = base64url(payload).base64url(HMAC-SHA256).
// Payload {v, a: applicationId, f: formType, i: issued-at seconds}. A link is valid for
// LINK_VALIDITY_DAYS after it was issued (project lead, 2026-10-26; do not change without their
// approval); single use is enforced by an existing Form Submission. Rotating LINK_TOKEN_SECRET
// revokes every unused link. Self-contained (node:crypto only) so scripts/make-form-link.mts can use it.

// `label`: internal name for HR (make-link output, Form Submission record names in Twenty).
// `title` and `lead`: what the applicant sees at the top of the page.
export const LINK_FORM_TYPES = {
  CONTACTED: {
    path: 'contacted',
    label: 'Form 1 (Contacted)',
    title: 'Tell Us More About You',
    lead: 'Thank you for applying. These questions help us understand your interests, experience and availability.',
  },
  BEFORE_MEETING: {
    path: 'before-meeting',
    label: 'Form 2 (Before Meeting)',
    title: 'Getting Ready for Your Orientation',
    lead: 'Before we meet, tell us what you think of the work you have seen and where you could contribute.',
  },
  MASTERCLASS: {
    path: 'masterclass',
    label: 'Form 3 (Masterclass)',
    title: 'Final Steps Before Your Interview',
    lead: 'Tell us how you see your next steps, and share two references.',
  },
} as const;

export type LinkFormType = keyof typeof LINK_FORM_TYPES;

export const isLinkFormType = (value: unknown): value is LinkFormType =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(LINK_FORM_TYPES, value);

export type LinkTokenPayload = { applicationId: string; formType: LinkFormType };

export type VerifyResult =
  | ({ ok: true } & LinkTokenPayload)
  | { ok: false; code: 'MALFORMED' | 'BAD_SIGNATURE' | 'WRONG_FORM' | 'EXPIRED' };

export const LINK_VALIDITY_DAYS = 21;
const VALIDITY_SECONDS = LINK_VALIDITY_DAYS * 24 * 60 * 60;
// Issued-at may be slightly ahead of this server's clock (link made on another machine).
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const VERSION = 1;
const MAX_TOKEN_LENGTH = 512;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest();

export function createLinkToken({ applicationId, formType }: LinkTokenPayload, secret: string, now = new Date()): string {
  if (!UUID.test(applicationId)) throw new Error('applicationId must be a UUID');
  if (!isLinkFormType(formType)) throw new Error('unknown formType');
  const payload = Buffer.from(
    JSON.stringify({ v: VERSION, a: applicationId.toLowerCase(), f: formType, i: Math.floor(now.getTime() / 1000) }),
  ).toString('base64url');
  return `${payload}.${sign(payload, secret).toString('base64url')}`;
}

export function verifyLinkToken(token: unknown, secret: string, expectedForm: LinkFormType, now = new Date()): VerifyResult {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return { ok: false, code: 'MALFORMED' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, code: 'MALFORMED' };
  const [payload, signature] = parts as [string, string];

  const expected = sign(payload, secret);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, code: 'BAD_SIGNATURE' };

  let data: { v?: unknown; a?: unknown; f?: unknown; i?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, code: 'MALFORMED' };
  }
  if (data.v !== VERSION || typeof data.a !== 'string' || !UUID.test(data.a) || !isLinkFormType(data.f)) {
    return { ok: false, code: 'MALFORMED' };
  }
  const issuedAt = data.i;
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (typeof issuedAt !== 'number' || !Number.isSafeInteger(issuedAt) || issuedAt <= 0 || issuedAt > nowSeconds + MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, code: 'MALFORMED' };
  }
  if (data.f !== expectedForm) return { ok: false, code: 'WRONG_FORM' };
  if (nowSeconds - issuedAt > VALIDITY_SECONDS) return { ok: false, code: 'EXPIRED' };
  return { ok: true, applicationId: data.a, formType: data.f };
}

export function formLinkUrl(baseUrl: string, payload: LinkTokenPayload, secret: string): string {
  const url = new URL(`/${LINK_FORM_TYPES[payload.formType].path}`, baseUrl);
  url.searchParams.set('t', createLinkToken(payload, secret));
  return url.toString();
}
