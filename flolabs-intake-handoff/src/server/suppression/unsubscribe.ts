import 'server-only';
import type { Logger } from '../logger';
import type { TwentyClient } from '../twenty/client';
import { normalizeEmail } from './normalize';
import type { SuppressionStore } from './types';
import { verifyUnsubscribeToken } from './unsubscribe-token';

export type UnsubscribeResult =
  | { ok: true; repeated: boolean }
  | { ok: false; code: 'INVALID_TOKEN' | 'PERSON_NOT_FOUND' | 'EMAIL_MISSING' | 'UNAVAILABLE' };

export async function unsubscribePerson(
  token: unknown,
  deps: {
    secret: string | undefined;
    people: Pick<TwentyClient, 'findPersonById' | 'updatePerson'>;
    suppressions: Pick<SuppressionStore, 'recordSuppression'>;
    logger: Logger;
    now?: () => Date;
  },
): Promise<UnsubscribeResult> {
  if (!deps.secret) return { ok: false, code: 'UNAVAILABLE' };
  const personId = verifyUnsubscribeToken(token, deps.secret);
  if (!personId) return { ok: false, code: 'INVALID_TOKEN' };

  try {
    const person = await deps.people.findPersonById(personId);
    if (!person) return { ok: false, code: 'PERSON_NOT_FOUND' };
    const rawEmail = person.emails?.primaryEmail;
    if (!rawEmail) return { ok: false, code: 'EMAIL_MISSING' };
    const email = normalizeEmail(rawEmail);
    const repeated = person.communicationConsent === false;

    await deps.suppressions.recordSuppression({
      email,
      normalizedEmail: email,
      reason: 'UNSUBSCRIBED',
      scope: 'ALL_MARKETING',
      eventId: `UNSUBSCRIBE:${person.id}`,
      source: 'UNSUBSCRIBE',
      occurredAt: (deps.now ?? (() => new Date()))().toISOString(),
    });
    if (!repeated) await deps.people.updatePerson(person.id, { communicationConsent: false });
    deps.logger.info('newsletter.unsubscribed', { code: repeated ? 'REPEATED' : 'UPDATED' });
    return { ok: true, repeated };
  } catch {
    deps.logger.error('newsletter.unsubscribe_failed', { code: 'UNAVAILABLE' });
    return { ok: false, code: 'UNAVAILABLE' };
  }
}
