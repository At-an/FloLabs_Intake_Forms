import { describe, expect, it, vi } from 'vitest';
import { createTurnstileVerifier } from './turnstile';

function verifier(respond: () => Response | Promise<Response>) {
  const seen: URLSearchParams[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    seen.push(init!.body as URLSearchParams);
    return respond();
  }) as unknown as typeof fetch;
  return { verify: createTurnstileVerifier({ secretKey: 'secret-key', expectedAction: 'application', fetch: fetchImpl }), seen, fetchImpl };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

describe('Turnstile verifier', () => {
  it('passes a successful token and sends secret, token and IP to Cloudflare', async () => {
    const { verify, seen } = verifier(() => json({ success: true, action: 'application' }));
    expect(await verify('token-123', '203.0.113.7')).toEqual({ ok: true });
    expect(Object.fromEntries(seen[0]!)).toEqual({ secret: 'secret-key', response: 'token-123', remoteip: '203.0.113.7' });
  });

  it('rejects with the Cloudflare error code', async () => {
    const { verify } = verifier(() => json({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
    expect(await verify('used-token', undefined)).toEqual({ ok: false, code: 'TURNSTILE_timeout-or-duplicate' });
  });

  it('rejects a token issued for another form', async () => {
    const { verify } = verifier(() => json({ success: true, action: 'contact-us' }));
    expect(await verify('token', undefined)).toEqual({ ok: false, code: 'TURNSTILE_WRONG_ACTION' });
  });

  it('fails closed when Cloudflare cannot be reached', async () => {
    const { verify } = verifier(() => Promise.reject(new TypeError('fetch failed')));
    expect(await verify('token', undefined)).toEqual({ ok: false, code: 'TURNSTILE_UNREACHABLE' });
  });

  it.each([undefined, '', 42, 'x'.repeat(3000)])('rejects a missing or malformed token (%j) without calling Cloudflare', async (token) => {
    const { verify, fetchImpl } = verifier(() => json({ success: true }));
    expect(await verify(token, undefined)).toEqual({ ok: false, code: 'TURNSTILE_MISSING_TOKEN' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
