import { createApplicationsHandler } from '@/server/applications/handler';
import { getEnv } from '@/server/env';
import { logger } from '@/server/logger';
import { createRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { createTurnstileVerifier } from '@/server/turnstile';
import { getTwentyClient } from '@/server/twenty';
import { TURNSTILE_ACTIONS } from '@/shared/config/application';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rate limits (T7, RATE_LIMITS): per IP counts every request; per email counts valid submissions.

let handle: ReturnType<typeof createApplicationsHandler> | undefined;

export async function POST(request: Request) {
  if (!handle) {
    const env = getEnv();
    handle = createApplicationsHandler({
      twenty: getTwentyClient(),
      logger,
      verifyHuman: createTurnstileVerifier({ secretKey: env.TURNSTILE_SECRET_KEY, expectedAction: TURNSTILE_ACTIONS.application }),
      ipLimiter: createRateLimiter(RATE_LIMITS.perIp),
      emailLimiter: createRateLimiter(RATE_LIMITS.perSender),
      trustedIpHeader: env.TRUSTED_IP_HEADER,
    });
  }
  return handle(request);
}
