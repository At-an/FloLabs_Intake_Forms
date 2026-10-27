import { getEnv } from '@/server/env';
import { logger } from '@/server/logger';
import { createRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { getSuppressionStore } from '@/server/suppression/aws-store';
import { createUnsubscribeHandler } from '@/server/suppression/unsubscribe-handler';
import { getTwentyClient } from '@/server/twenty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let handle: ReturnType<typeof createUnsubscribeHandler> | undefined;

export async function POST(request: Request) {
  try {
    if (!handle) {
      const env = getEnv();
      handle = createUnsubscribeHandler({
        secret: env.LINK_TOKEN_SECRET,
        people: getTwentyClient(),
        suppressions: getSuppressionStore(),
        logger,
        ipLimiter: createRateLimiter(RATE_LIMITS.perIp),
        trustedIpHeader: env.TRUSTED_IP_HEADER,
      });
    }
  } catch {
    logger.error('newsletter.unsubscribe_not_configured', { code: 'CONFIGURATION' });
    return Response.json(
      { error: { code: 'UNAVAILABLE', message: 'We could not update your email preferences. Please try again later.' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return handle(request);
}
