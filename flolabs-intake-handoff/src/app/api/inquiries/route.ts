import { getEnv } from '@/server/env';
import { createInquiriesHandler } from '@/server/inquiries/handler';
import { logger } from '@/server/logger';
import { createRateLimiter } from '@/server/rate-limit';
import { createTurnstileVerifier } from '@/server/turnstile';
import { getTwentyClient } from '@/server/twenty';
import { TURNSTILE_ACTIONS } from '@/shared/config/application';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Same limits as the Application form: 10 requests / 10 min per IP, 5 per email / 30 min.
const IP_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };
const EMAIL_LIMIT = { limit: 5, windowMs: 30 * 60 * 1000 };

let handle: ReturnType<typeof createInquiriesHandler> | undefined;

export async function POST(request: Request) {
  if (!handle) {
    const env = getEnv();
    handle = createInquiriesHandler({
      twenty: getTwentyClient(),
      logger,
      verifyHuman: createTurnstileVerifier({ secretKey: env.TURNSTILE_SECRET_KEY, expectedAction: TURNSTILE_ACTIONS.contactUs }),
      ipLimiter: createRateLimiter(IP_LIMIT),
      emailLimiter: createRateLimiter(EMAIL_LIMIT),
      trustedIpHeader: env.TRUSTED_IP_HEADER,
    });
  }
  return handle(request);
}
