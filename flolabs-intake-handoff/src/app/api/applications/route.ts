import { createApplicationsHandler } from '@/server/applications/handler';
import { getEnv } from '@/server/env';
import { logger } from '@/server/logger';
import { createRateLimiter } from '@/server/rate-limit';
import { createTurnstileVerifier } from '@/server/turnstile';
import { getTwentyClient } from '@/server/twenty';
import { TURNSTILE_ACTIONS } from '@/shared/config/application';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rate limits (T7): per IP counts every request; per email counts valid submissions.
const IP_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };
const EMAIL_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

let handle: ReturnType<typeof createApplicationsHandler> | undefined;

export async function POST(request: Request) {
  if (!handle) {
    const env = getEnv();
    handle = createApplicationsHandler({
      twenty: getTwentyClient(),
      logger,
      verifyHuman: createTurnstileVerifier({ secretKey: env.TURNSTILE_SECRET_KEY, expectedAction: TURNSTILE_ACTIONS.application }),
      ipLimiter: createRateLimiter(IP_LIMIT),
      emailLimiter: createRateLimiter(EMAIL_LIMIT),
      trustedIpHeader: env.TRUSTED_IP_HEADER,
    });
  }
  return handle(request);
}
