import { describe, expect, it } from 'vitest';
import { clientIp, createRateLimiter } from './rate-limit';

describe('createRateLimiter', () => {
  it('allows up to the limit, then blocks with the time to wait', () => {
    let now = 1_000_000;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });
    expect([limiter.hit('a'), limiter.hit('a'), limiter.hit('a')].every((r) => r.allowed)).toBe(true);
    now += 10_000;
    expect(limiter.hit('a')).toEqual({ allowed: false, retryAfterSeconds: 50 });
  });

  it('frees a slot once the oldest hit leaves the window', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000, now: () => now });
    limiter.hit('a');
    now = 500;
    limiter.hit('a');
    now = 999;
    expect(limiter.hit('a').allowed).toBe(false);
    now = 1_001;
    expect(limiter.hit('a').allowed).toBe(true);
  });

  it('counts keys independently', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.hit('email:a@example.com').allowed).toBe(true);
    expect(limiter.hit('email:b@example.com').allowed).toBe(true);
    expect(limiter.hit('email:a@example.com').allowed).toBe(false);
  });

  it('forgets the least recently used keys beyond maxKeys', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2 });
    limiter.hit('a');
    limiter.hit('b');
    limiter.hit('c'); // evicts "a"
    expect(limiter.hit('a').allowed).toBe(true);
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) => new Request('http://localhost/', { headers });

  it('trusts no header unless one is configured', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7' }), undefined)).toBeUndefined();
  });

  it('reads the configured header (first hop for x-forwarded-for)', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '203.0.113.7' }), 'cf-connecting-ip')).toBe('203.0.113.7');
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }), 'x-forwarded-for')).toBe('203.0.113.7');
    expect(clientIp(req({}), 'cf-connecting-ip')).toBeUndefined();
  });
});
