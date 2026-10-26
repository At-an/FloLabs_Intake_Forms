import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UnsubscribePayload = { v: 1; personId: string };

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest();
}

export function createUnsubscribeToken(personId: string, secret: string): string {
  if (!UUID.test(personId)) throw new Error('PERSON_ID_INVALID');
  if (secret.length < 32) throw new Error('LINK_TOKEN_SECRET_INVALID');
  const payload = Buffer.from(JSON.stringify({ v: 1, personId: personId.toLowerCase() } satisfies UnsubscribePayload)).toString('base64url');
  return `${payload}.${signature(payload, secret).toString('base64url')}`;
}

export function createUnsubscribeUrl(baseUrl: string, personId: string, secret: string): string {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('UNSUBSCRIBE_BASE_URL_INVALID');
  }
  const url = new URL('/unsubscribe', base.origin);
  url.hash = createUnsubscribeToken(personId, secret);
  return url.toString();
}

export function verifyUnsubscribeToken(token: unknown, secret: string): string | null {
  if (typeof token !== 'string' || token.length > 512) return null;
  const [payload, encodedSignature, extra] = token.split('.');
  if (!payload || !encodedSignature || extra !== undefined) return null;
  const expected = signature(payload, secret);
  const supplied = Buffer.from(encodedSignature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data !== 'object' || !('v' in data) || !('personId' in data)) return null;
    const value = data as Partial<UnsubscribePayload>;
    if (value.v !== 1 || typeof value.personId !== 'string' || !UUID.test(value.personId)) return null;
    return value.personId;
  } catch {
    return null;
  }
}
