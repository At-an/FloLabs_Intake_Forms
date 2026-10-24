import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Signed links for Forms 1-3 (T10): /<path>?t=<token>, token = base64url(payload).base64url(HMAC-SHA256).
// Payload {v, a: applicationId, f: formType, i: issued-at seconds}. No expiry (decided 2026-10-24);
// single use is enforced by an existing Form Submission. Rotating LINK_TOKEN_SECRET revokes
// every unused link. Self-contained (node:crypto only) so scripts/make-form-link.mts can use it.

export const LINK_FORM_TYPES = {
  CONTACTED: { path: 'contacted', label: 'Form 1 (Contacted)' },
  BEFORE_MEETING: { path: 'before-meeting', label: 'Form 2 (Before Meeting)' },
  MASTERCLASS: { path: 'masterclass', label: 'Form 3 (Masterclass)' },
} as const;

export type LinkFormType = keyof typeof LINK_FORM_TYPES;

export const isLinkFormType = (value: unknown): value is LinkFormType =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(LINK_FORM_TYPES, value);

export type LinkTokenPayload = { applicationId: string; formType: LinkFormType };

export type VerifyResult =
  | ({ ok: true } & LinkTokenPayload)
  | { ok: false; code: 'MALFORMED' | 'BAD_SIGNATURE' | 'WRONG_FORM' };

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

export function verifyLinkToken(token: unknown, secret: string, expectedForm: LinkFormType): VerifyResult {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return { ok: false, code: 'MALFORMED' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, code: 'MALFORMED' };
  const [payload, signature] = parts as [string, string];

  const expected = sign(payload, secret);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, code: 'BAD_SIGNATURE' };

  let data: { v?: unknown; a?: unknown; f?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, code: 'MALFORMED' };
  }
  if (data.v !== VERSION || typeof data.a !== 'string' || !UUID.test(data.a) || !isLinkFormType(data.f)) {
    return { ok: false, code: 'MALFORMED' };
  }
  if (data.f !== expectedForm) return { ok: false, code: 'WRONG_FORM' };
  return { ok: true, applicationId: data.a, formType: data.f };
}

export function formLinkUrl(baseUrl: string, payload: LinkTokenPayload, secret: string): string {
  const url = new URL(`/${LINK_FORM_TYPES[payload.formType].path}`, baseUrl);
  url.searchParams.set('t', createLinkToken(payload, secret));
  return url.toString();
}
