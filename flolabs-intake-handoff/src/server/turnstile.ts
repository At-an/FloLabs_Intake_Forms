import 'server-only';

// Cloudflare Turnstile server-side check (CLAUDE.md rule 5). Tokens are single use and
// expire after 5 minutes. Fails closed: if Cloudflare cannot be reached, the check fails.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2048;

export type TurnstileResult = { ok: true } | { ok: false; code: string };

export type VerifyHuman = (token: unknown, remoteIp: string | undefined) => Promise<TurnstileResult>;

export function createTurnstileVerifier({
  secretKey,
  expectedAction,
  fetch: fetchImpl = fetch,
  timeoutMs = 5_000,
}: {
  secretKey: string;
  expectedAction: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): VerifyHuman {
  return async (token, remoteIp) => {
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
      return { ok: false, code: 'TURNSTILE_MISSING_TOKEN' };
    }
    const form = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp) form.set('remoteip', remoteIp);

    let body: { success?: boolean; action?: string; 'error-codes'?: unknown[] } | null;
    try {
      const response = await fetchImpl(SITEVERIFY_URL, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
      body = await response.json().catch(() => null);
    } catch {
      return { ok: false, code: 'TURNSTILE_UNREACHABLE' };
    }

    if (!body?.success) {
      const first = body?.['error-codes']?.[0];
      return { ok: false, code: typeof first === 'string' ? `TURNSTILE_${first}` : 'TURNSTILE_REJECTED' };
    }
    // Cloudflare's test keys return no action; real keys echo the widget's action.
    if (body.action && body.action !== expectedAction) return { ok: false, code: 'TURNSTILE_WRONG_ACTION' };
    return { ok: true };
  };
}
