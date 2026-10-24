import 'server-only';
import { z } from 'zod';

// Server environment, validated once. Later tasks add their variables here
// (Turnstile in T7, R2 in T6c path B, LINK_TOKEN_SECRET in T10).
const envSchema = z.object({
  TWENTY_BASE_URL: z.url({ protocol: /^https$/ }).transform((url) => url.replace(/\/+$/, '')),
  TWENTY_API_KEY: z.string().min(20),
});

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
