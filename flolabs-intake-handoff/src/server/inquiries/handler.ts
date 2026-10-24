import 'server-only';
import { contactUsSchema, type ContactUsData } from '@/shared/forms/embed-forms';
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
import type { Site } from '../twenty/types';

// POST /api/inquiries (Contact Us, T9): Person (fill-empty) + one Inquiry with Site, status New.

const MAX_BODY_BYTES = 16 * 1024;

export type InquiryDeps = GuardDeps & {
  twenty: Pick<
    TwentyClient,
    'findSiteByKey' | 'findPersonByEmail' | 'createPerson' | 'updatePerson' | 'findInquiryBySubmissionKey' | 'createInquiry'
  >;
  now?: () => Date;
};

type Result = { inquiryId: string; duplicate: boolean };

export async function submitInquiry(data: ContactUsData, site: Site, deps: InquiryDeps): Promise<Result> {
  const { twenty, logger, now = () => new Date() } = deps;
  const existing = await twenty.findInquiryBySubmissionKey(data.submissionKey);
  if (existing) {
    logger.info('inquiry.duplicate', { recordId: existing.id });
    return { inquiryId: existing.id, duplicate: true };
  }

  const { personId } = await upsertPersonByEmail(
    { emails: { primaryEmail: data.email, additionalEmails: [] }, name: { firstName: data.firstName, lastName: data.lastName } },
    deps,
  );
  const { id } = await twenty.createInquiry({
    name: `${data.firstName} ${data.lastName} - ${data.subject}`.slice(0, 250),
    subject: data.subject,
    message: data.message,
    status: 'NEW',
    submittedAt: now().toISOString(),
    submissionKey: data.submissionKey,
    personId,
    siteId: site.id,
  });
  logger.info('inquiry.created', { recordId: id, personId, siteId: site.id });
  return { inquiryId: id, duplicate: false };
}

export function createInquiriesHandler(deps: InquiryDeps) {
  const once = singleFlight<Result>();

  return async function handle(request: Request): Promise<Response> {
    const started = Date.now();
    try {
      const { response: limited, ip } = checkIpLimit(request, deps, 'inquiry.rate_limited');
      if (limited) return limited;

      const body = await readJsonObject(request, MAX_BODY_BYTES);
      const parsed = contactUsSchema.safeParse(body);
      if (!parsed.success) {
        deps.logger.info('inquiry.invalid', { code: 'VALIDATION_FAILED', durationMs: Date.now() - started });
        return validationFailed(fieldErrors(parsed.error));
      }

      const blocked = await checkEmailAndHuman(parsed.data.email, body.turnstileToken, ip, deps, 'inquiry.blocked');
      if (blocked) return blocked;

      const site = await findActiveSite(deps.twenty, body.site);
      if (!site) throw new AppError('FORM_NOT_AVAILABLE');

      const result = await once(parsed.data.submissionKey, () => submitInquiry(parsed.data, site, deps));
      return json(result.duplicate ? 200 : 201, { inquiryId: result.inquiryId });
    } catch (error) {
      return failure(deps.logger, 'inquiry.failed', error, started);
    }
  };
}
