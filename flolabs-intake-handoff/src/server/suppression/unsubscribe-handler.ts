import 'server-only';
import type { Logger } from '../logger';
import { clientIp, type RateLimiter } from '../rate-limit';
import { json, readJsonObject, rateLimited } from '../public-post';
import type { TwentyClient } from '../twenty/client';
import type { SuppressionStore } from './types';
import { unsubscribePerson } from './unsubscribe';

const MAX_BODY_BYTES = 2048;

export type UnsubscribeHandlerDeps = {
  secret: string | undefined;
  people: Pick<TwentyClient, 'findPersonById' | 'updatePerson'>;
  suppressions: Pick<SuppressionStore, 'recordSuppression'>;
  logger: Logger;
  ipLimiter: RateLimiter;
  trustedIpHeader?: string;
};

export function createUnsubscribeHandler(deps: UnsubscribeHandlerDeps) {
  return async function handle(request: Request): Promise<Response> {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) {
      deps.logger.warn('newsletter.unsubscribe_blocked', { code: 'ORIGIN_REJECTED' });
      return json(403, { error: { code: 'INVALID_REQUEST', message: 'Please open the unsubscribe link directly.' } });
    }

    const ip = clientIp(request, deps.trustedIpHeader);
    const limit = deps.ipLimiter.hit(`unsubscribe:${ip ?? 'unknown'}`);
    if (!limit.allowed) {
      deps.logger.warn('newsletter.unsubscribe_rate_limited', { code: 'RATE_LIMIT_IP' });
      return rateLimited(limit.retryAfterSeconds);
    }

    let body: Record<string, unknown>;
    try {
      body = await readJsonObject(request, MAX_BODY_BYTES);
    } catch {
      return json(400, { error: { code: 'INVALID_REQUEST', message: 'This unsubscribe link is not valid.' } });
    }
    if (typeof body.token !== 'string') {
      return json(400, { error: { code: 'INVALID_REQUEST', message: 'This unsubscribe link is not valid.' } });
    }

    const result = await unsubscribePerson(body.token, deps);
    if (result.ok) return json(200, { unsubscribed: true });
    if (result.code === 'INVALID_TOKEN' || result.code === 'PERSON_NOT_FOUND' || result.code === 'EMAIL_MISSING') {
      return json(400, { error: { code: 'INVALID_REQUEST', message: 'This unsubscribe link is not valid.' } });
    }
    return json(503, { error: { code: 'UNAVAILABLE', message: 'We could not update your email preferences. Please try again later.' } });
  };
}
