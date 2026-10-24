import 'server-only';
import type { Logger } from '../logger';
import { TwentyError, type TwentyClient } from '../twenty/client';
import type { ApplicationForLink } from '../twenty/types';
import { verifyLinkToken, type LinkFormType } from './link-tokens';

// Opening a Form 1/2/3 link (T10): valid signature for this form -> Application exists ->
// no Form Submission of this type yet (single use). Every failure maps to one friendly page.

export type OpenLinkResult =
  | { ok: true; application: ApplicationForLink }
  | { ok: false; reason: 'INVALID' | 'NOT_FOUND' | 'USED' | 'UNAVAILABLE' };

export type OpenLinkDeps = {
  twenty: Pick<TwentyClient, 'findApplicationForLink' | 'findFormSubmissionFor'>;
  logger: Logger;
  secret: string | undefined;
};

export async function openFormLink(token: unknown, formType: LinkFormType, { twenty, logger, secret }: OpenLinkDeps): Promise<OpenLinkResult> {
  if (!secret) {
    logger.error('form_link.not_configured', { code: 'LINK_TOKEN_SECRET_MISSING', form: formType });
    return { ok: false, reason: 'UNAVAILABLE' };
  }
  const verified = verifyLinkToken(token, secret, formType);
  if (!verified.ok) {
    logger.warn('form_link.invalid', { code: verified.code, form: formType });
    return { ok: false, reason: 'INVALID' };
  }

  try {
    const application = await twenty.findApplicationForLink(verified.applicationId);
    if (!application) {
      logger.warn('form_link.not_found', { applicationId: verified.applicationId, form: formType });
      return { ok: false, reason: 'NOT_FOUND' };
    }
    const existing = await twenty.findFormSubmissionFor(application.id, formType);
    if (existing) {
      logger.info('form_link.used', { applicationId: application.id, recordId: existing.id, form: formType });
      return { ok: false, reason: 'USED' };
    }
    logger.info('form_link.opened', { applicationId: application.id, form: formType });
    return { ok: true, application };
  } catch (error) {
    logger.error('form_link.failed', {
      applicationId: verified.applicationId,
      form: formType,
      code: error instanceof TwentyError ? error.code : 'INTERNAL',
      op: error instanceof TwentyError ? error.op : undefined,
    });
    return { ok: false, reason: 'UNAVAILABLE' };
  }
}
