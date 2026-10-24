import { getEnv } from '@/server/env';
import { LINK_FORM_TYPES, type LinkFormType } from '@/server/forms/link-tokens';
import { createLinkFormHandler } from '@/server/forms/submit-link-form';
import { logger } from '@/server/logger';
import { createRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { createTurnstileVerifier } from '@/server/turnstile';
import { getTwentyClient } from '@/server/twenty';
import { TURNSTILE_ACTIONS } from '@/shared/config/application';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/forms/contacted | before-meeting | masterclass (T12-T14).
// Same limits as the other forms (RATE_LIMITS: per IP, and per Application instead of per email).

const FORM_BY_PATH = new Map<string, LinkFormType>(
  Object.entries(LINK_FORM_TYPES).map(([formType, { path }]) => [path, formType as LinkFormType]),
);

// One limiter pair shared by the three forms, so the limits count across them.
let limiters: { ipLimiter: ReturnType<typeof createRateLimiter>; emailLimiter: ReturnType<typeof createRateLimiter> } | undefined;
const handlers = new Map<LinkFormType, ReturnType<typeof createLinkFormHandler>>();

export async function POST(request: Request, { params }: { params: Promise<{ form: string }> }) {
  const formType = FORM_BY_PATH.get((await params).form);
  if (!formType) return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });

  let handle = handlers.get(formType);
  if (!handle) {
    const env = getEnv();
    limiters ??= { ipLimiter: createRateLimiter(RATE_LIMITS.perIp), emailLimiter: createRateLimiter(RATE_LIMITS.perSender) };
    handle = createLinkFormHandler(formType, {
      twenty: getTwentyClient(),
      logger,
      verifyHuman: createTurnstileVerifier({ secretKey: env.TURNSTILE_SECRET_KEY, expectedAction: TURNSTILE_ACTIONS[formType] }),
      ...limiters,
      trustedIpHeader: env.TRUSTED_IP_HEADER,
      secret: env.LINK_TOKEN_SECRET,
    });
    handlers.set(formType, handle);
  }
  return handle(request);
}
