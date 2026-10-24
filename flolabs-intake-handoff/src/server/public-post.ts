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
export function checkEmailAndHuman(
  email: string,
  token: unknown,
  ip: string | undefined,
  deps: GuardDeps,
  event: string,
): Promise<Response | undefined> {
  return checkLimitAndHuman(`email:${email}`, 'RATE_LIMIT_EMAIL', token, ip, deps, event);
}

/**
 * Second limit (`deps.emailLimiter`) on any key that identifies the sender, e.g. the Application
 * of a signed link, then Turnstile. Returns a response to send when either fails.
 */
export async function checkLimitAndHuman(
  limitKey: string,
  limitCode: string,
  token: unknown,
  ip: string | undefined,
  deps: GuardDeps,
  event: string,
): Promise<Response | undefined> {
  const check = deps.emailLimiter.hit(limitKey);
  if (!check.allowed) {
    deps.logger.warn(event, { code: limitCode });
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

/**
 * Reads the body but never more than `maxBytes`, whatever Content-Length claims (it may be
 * missing or false, e.g. with chunked uploads). Throws VALIDATION_FAILED past the limit.
 */
export async function readBodyCapped(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length') ?? '0') > maxBytes) throw new AppError('VALIDATION_FAILED');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new AppError('VALIDATION_FAILED');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Reads a small JSON object body; throws VALIDATION_FAILED for anything else. */
export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new AppError('VALIDATION_FAILED');
  }
  const text = new TextDecoder().decode(await readBodyCapped(request, maxBytes));
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

/**
 * Runs jobs with the same key one after another (in this process). Used where two different
 * requests must not both pass a "not done yet" check, e.g. two tabs sending the same link form.
 */
export function keyedQueue() {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string, run: () => Promise<T>): Promise<T> => {
    const next = (tails.get(key) ?? Promise.resolve()).then(run, run);
    const tail = next.catch(() => {});
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return next;
  };
}
