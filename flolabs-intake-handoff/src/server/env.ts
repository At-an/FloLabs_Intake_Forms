import 'server-only';
import { z } from 'zod';

// Server environment, validated once.

/**
 * Cloudflare's published Turnstile test keys (always pass). Used only outside production
 * when no keys are configured, so local development works without real keys.
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const TURNSTILE_TEST_KEYS = {
  siteKey: '1x00000000000000000000AA',
  secretKey: '1x0000000000000000000000000000000AA',
} as const;

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TWENTY_BASE_URL: z.url({ protocol: /^https$/ }).transform((url) => url.replace(/\/+$/, '')),
  TWENTY_API_KEY: z.string().min(20),
  TURNSTILE_SITE_KEY: z.string().min(10).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(10).optional(),
  // Header carrying the real client IP when the app runs behind a proxy (T7 rate limits).
  // Unset: no header is trusted (local development: all requests share one IP bucket).
  // Required in production: without it every visitor shares one bucket, so the per-IP limit
  // (10 / 10 min) would apply to the whole site (T15).
  TRUSTED_IP_HEADER: z.enum(['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip']).optional(),
  // Signs Form 1-3 links (T10). At least 32 characters; rotating it revokes all unused links.
  LINK_TOKEN_SECRET: z.string().min(32).optional(),
});

const envSchema = baseSchema
  .refine((env) => env.NODE_ENV !== 'production' || env.TURNSTILE_SITE_KEY, {
    path: ['TURNSTILE_SITE_KEY'],
    message: 'required in production',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.TURNSTILE_SECRET_KEY, {
    path: ['TURNSTILE_SECRET_KEY'],
    message: 'required in production',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.LINK_TOKEN_SECRET, {
    path: ['LINK_TOKEN_SECRET'],
    message: 'required in production',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.TRUSTED_IP_HEADER, {
    path: ['TRUSTED_IP_HEADER'],
    message: 'required in production',
  })
  .transform(({ TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, ...env }) => ({
    ...env,
    TURNSTILE_SITE_KEY: TURNSTILE_SITE_KEY ?? TURNSTILE_TEST_KEYS.siteKey,
    TURNSTILE_SECRET_KEY: TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST_KEYS.secretKey,
  }));

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(readonly invalidVariables: string[]) {
    // Names only, never values.
    super(`Invalid or missing environment variables: ${invalidVariables.join(', ')}`);
    this.name = 'EnvError';
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError([...new Set(result.error.issues.map((issue) => issue.path.join('.')))]);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
