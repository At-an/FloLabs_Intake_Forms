import 'server-only';
import { createHash } from 'node:crypto';

// Sliding-window rate limiter kept in memory (CLAUDE.md rule 5). Fits the single-server POC;
// with several servers, move it to a shared store or to Cloudflare rate-limiting rules.
// Keys are hashed, so no email or IP address is kept in memory as plain text.

/**
 * The limits of every public form (one place, used by all four routes):
 * - perIp: every request from one IP address, all forms together per route (decided by FloLabs
 *   2026-10-24: 50 per 10 minutes);
 * - perSender: valid submissions per email address (Application, Contact Us, Newsletter) or per
 *   Application (Forms 1-3 links): 5 per 30 minutes.
 */
export const RATE_LIMITS = {
  perIp: { limit: 50, windowMs: 10 * 60 * 1000 },
  perSender: { limit: 5, windowMs: 30 * 60 * 1000 },
} as const;

export type RateLimiter = {
  /** Records one hit for `key`; returns how long to wait when the limit is exceeded. */
  hit(key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number };
};

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
  now = () => Date.now(),
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
}): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    hit(rawKey) {
      const key = createHash('sha256').update(rawKey).digest('base64url');
      const current = now();
      const recent = (hits.get(key) ?? []).filter((t) => current - t < windowMs);

      if (recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0]! + windowMs - current) / 1000)) };
      }

      recent.push(current);
      hits.delete(key); // re-insert so the Map stays ordered by last use
      hits.set(key, recent);
      if (hits.size > maxKeys) hits.delete(hits.keys().next().value!);
      return { allowed: true };
    },
  };
}

/** Client IP from the configured proxy header; undefined when no header is trusted. */
export function clientIp(request: Request, trustedHeader: string | undefined): string | undefined {
  if (!trustedHeader) return undefined;
  const value = request.headers.get(trustedHeader);
  if (!value) return undefined;
  const ip = (trustedHeader === 'x-forwarded-for' ? value.split(',')[0] : value)!.trim();
  return ip.length > 0 && ip.length <= 45 ? ip : undefined;
}
