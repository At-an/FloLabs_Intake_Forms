import 'server-only';
import { NEWSLETTER_FORM } from '@/shared/config/embed-forms';
import { newsletterSchema } from '@/shared/forms/embed-forms';
import { fieldErrors } from '@/shared/forms/field-errors';
import { AppError } from '../errors';
import { upsertPersonByEmail } from '../people/person';
import {
  checkEmailAndHuman,
  checkIpLimit,
  failure,
  findActiveSite,
  json,
  readJsonObject,
  singleFlight,
  validationFailed,
  type GuardDeps,
} from '../public-post';
import type { TwentyClient } from '../twenty/client';

// POST /api/newsletter (T8): find-or-create the Person by email and record marketing consent
// in the Person consent fields (spec D17). Re-subscribing is a no-op; the reply is the same
// whether or not the email was already known, so the endpoint cannot be used to look up emails.
// Double opt-in (confirmation email) waits for SES.

const MAX_BODY_BYTES = 4 * 1024;

export type NewsletterDeps = GuardDeps & {
  twenty: Pick<TwentyClient, 'findSiteByKey' | 'findPersonByEmail' | 'createPerson' | 'updatePerson'>;
  now?: () => Date;
};

export function createNewsletterHandler(deps: NewsletterDeps) {
  const once = singleFlight<void>();
  const now = deps.now ?? (() => new Date());

  return async function handle(request: Request): Promise<Response> {
    const started = Date.now();
    try {
      const { response: limited, ip } = checkIpLimit(request, deps, 'newsletter.rate_limited');
      if (limited) return limited;

      const body = await readJsonObject(request, MAX_BODY_BYTES);
      const parsed = newsletterSchema.safeParse(body);
      if (!parsed.success) {
        deps.logger.info('newsletter.invalid', { code: 'VALIDATION_FAILED', durationMs: Date.now() - started });
        return validationFailed(fieldErrors(parsed.error));
      }
      const { email } = parsed.data;

      const blocked = await checkEmailAndHuman(email, body.turnstileToken, ip, deps, 'newsletter.blocked');
      if (blocked) return blocked;

      const site = await findActiveSite(deps.twenty, body.site);
      if (!site) throw new AppError('FORM_NOT_AVAILABLE');

      await once(email, async () => {
        const { personId, created } = await upsertPersonByEmail(
          {
            emails: { primaryEmail: email, additionalEmails: [] },
            consent: { at: now().toISOString(), version: NEWSLETTER_FORM.consentVersion, siteKey: site.siteId },
          },
          deps,
        );
        deps.logger.info('newsletter.subscribed', { personId, siteId: site.id, code: created ? 'NEW_PERSON' : 'EXISTING_PERSON' });
      });
      return json(200, { subscribed: true });
    } catch (error) {
      return failure(deps.logger, 'newsletter.failed', error, started);
    }
  };
}
