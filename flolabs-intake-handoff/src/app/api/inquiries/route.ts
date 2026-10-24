import { getEnv } from '@/server/env';
import { createInquiriesHandler } from '@/server/inquiries/handler';
import { logger } from '@/server/logger';
import { createRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { createTurnstileVerifier } from '@/server/turnstile';
import { getTwentyClient } from '@/server/twenty';
import { TURNSTILE_ACTIONS } from '@/shared/config/application';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Same limits as the Application form (RATE_LIMITS: per IP, per email).

let handle: ReturnType<typeof createInquiriesHandler> | undefined;

export async function POST(request: Request) {
  if (!handle) {
    const env = getEnv();
    handle = createInquiriesHandler({
      twenty: getTwentyClient(),
      logger,
      verifyHuman: createTurnstileVerifier({ secretKey: env.TURNSTILE_SECRET_KEY, expectedAction: TURNSTILE_ACTIONS.contactUs }),
      ipLimiter: createRateLimiter(RATE_LIMITS.perIp),
      emailLimiter: createRateLimiter(RATE_LIMITS.perSender),
      trustedIpHeader: env.TRUSTED_IP_HEADER,
    });
  }
  return handle(request);
}
