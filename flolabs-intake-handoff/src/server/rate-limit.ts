import 'server-only';
import { createHash } from 'node:crypto';

// Sliding-window rate limiter kept in memory (CLAUDE.md rule 5). Fits the single-server POC;
// with several servers, move it to a shared store or to Cloudflare rate-limiting rules.
// Keys are hashed, so no email or IP address is kept in memory as plain text.

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
