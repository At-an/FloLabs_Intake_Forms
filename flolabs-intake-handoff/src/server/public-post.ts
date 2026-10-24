import 'server-only';
import { AppError, errorCodeOf, toPublicError } from './errors';
import type { Logger } from './logger';
import { clientIp, type RateLimiter } from './rate-limit';
import type { VerifyHuman } from './turnstile';
import { TwentyError } from './twenty/client';

// Building blocks shared by the public POST endpoints (CLAUDE.md rule 5: rate limits and
// Turnstile run before any Twenty call).

export type GuardDeps = {
  logger: Logger;
  verifyHuman: VerifyHuman;
  ipLimiter: RateLimiter;
  emailLimiter: RateLimiter;
  trustedIpHeader?: string;
};

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export function validationFailed(fields?: Partial<Record<string, string>>) {
  const { status, body } = toPublicError(new AppError('VALIDATION_FAILED'));
  // Field messages come from our own rules, never from input or upstream systems.
  return json(status, { error: { ...body.error, ...(fields && { fields }) } });
}

export function rateLimited(retryAfterSeconds: number) {
  const { status, body } = toPublicError(new AppError('RATE_LIMITED'));
  return json(status, body, { 'Retry-After': String(retryAfterSeconds) });
}

/** Per-IP limit; returns a 429 response when exceeded, otherwise the client IP (if known). */
export function checkIpLimit(request: Request, deps: GuardDeps, event: string): { response?: Response; ip?: string } {
  const ip = clientIp(request, deps.trustedIpHeader);
  const check = deps.ipLimiter.hit(`ip:${ip ?? 'unknown'}`);
  if (check.allowed) return { ip };
  deps.logger.warn(event, { code: 'RATE_LIMIT_IP' });
  return { response: rateLimited(check.retryAfterSeconds) };
}

/** Per-email limit, then Turnstile. Returns a response to send when either fails. */
export async function checkEmailAndHuman(
  email: string,
  token: unknown,
  ip: string | undefined,
  deps: GuardDeps,
  event: string,
): Promise<Response | undefined> {
  const check = deps.emailLimiter.hit(`email:${email}`);
  if (!check.allowed) {
    deps.logger.warn(event, { code: 'RATE_LIMIT_EMAIL' });
    return rateLimited(check.retryAfterSeconds);
  }
  const human = await deps.verifyHuman(token, ip);
  if (!human.ok) {
    deps.logger.warn(event, { code: human.code });
    const { status, body } = toPublicError(new AppError('BOT_CHECK_FAILED'));
    return json(status, body);
  }
  return undefined;
}

/** Reads a small JSON object body; throws VALIDATION_FAILED for anything else. */
export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new AppError('VALIDATION_FAILED');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new AppError('VALIDATION_FAILED');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AppError('VALIDATION_FAILED');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('VALIDATION_FAILED');
  return body as Record<string, unknown>;
}

/** Logs a failed request with codes only and returns the generic public error. */
export function failure(logger: Logger, event: string, error: unknown, started: number): Response {
  logger.error(event, {
    code: error instanceof TwentyError ? error.code : errorCodeOf(error),
    op: error instanceof TwentyError ? error.op : undefined,
    status: error instanceof TwentyError ? error.status : undefined,
    durationMs: Date.now() - started,
  });
  const { status, body } = toPublicError(error);
  return json(status, body);
}

/** Runs one job per key at a time; concurrent callers with the same key share the result. */
export function singleFlight<T>() {
  const inFlight = new Map<string, Promise<T>>();
  return (key: string, run: () => Promise<T>): Promise<T> => {
    let pending = inFlight.get(key);
    if (!pending) {
      pending = run();
      inFlight.set(key, pending);
      pending.finally(() => inFlight.delete(key)).catch(() => {});
    }
    return pending;
  };
}
