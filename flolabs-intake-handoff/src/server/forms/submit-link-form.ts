import 'server-only';
import { z } from 'zod';
import { typedFieldValues } from '@/shared/forms/engine';
import { fieldErrors } from '@/shared/forms/field-errors';
import { REFERENCE_KEYS, buildLinkForm, linkFormSchema, renderLinkFormSummary, type LinkFormData } from '@/shared/forms/link-forms';
import { AppError, toPublicError } from '../errors';
import {
  checkIpLimit,
  checkLimitAndHuman,
  failure,
  json,
  keyedQueue,
  readJsonObject,
  validationFailed,
  type GuardDeps,
} from '../public-post';
import type { TwentyClient } from '../twenty/client';
import type { FormSubmissionInput } from '../twenty/types';
import { LINK_FORM_TYPES, verifyLinkToken, type LinkFormType } from './link-tokens';

// POST /api/forms/<form> (Forms 1-3, T12-T14). Order (CLAUDE.md rule 5): IP limit -> signed
// link (local HMAC check) -> per-Application limit -> Turnstile -> Twenty. Then: same
// submissionKey = the original result; link already used = 409; answers validated against the
// form built from the Application's programs; Form 3 references saved first, the Form
// Submission last, so the link is used up only once everything is saved.

// A cross-track applicant with many programs can send dozens of long answers.
const MAX_BODY_BYTES = 1024 * 1024;

export type LinkFormDeps = GuardDeps & {
  twenty: Pick<
    TwentyClient,
    | 'findApplicationForLink'
    | 'findFormSubmissionFor'
    | 'findFormSubmissionBySubmissionKey'
    | 'createFormSubmission'
    | 'findReferenceFor'
    | 'createReference'
  >;
  secret: string | undefined;
  now?: () => Date;
};

type Outcome =
  | { kind: 'created' | 'duplicate'; formSubmissionId: string }
  | { kind: 'used' | 'not_found' }
  | { kind: 'invalid'; fields: Partial<Record<string, string>> };

const submissionKeySchema = z.uuid();

export async function submitLinkForm(
  formType: LinkFormType,
  applicationId: string,
  body: Record<string, unknown>,
  deps: LinkFormDeps,
): Promise<Outcome> {
  const { twenty, logger, now = () => new Date() } = deps;
  const event = `form_submission.${formType.toLowerCase()}`;

  const previous = await twenty.findFormSubmissionBySubmissionKey(String(body.submissionKey));
  if (previous) {
    // A UUID collision with another applicant's form is not a retry: refuse it.
    if (previous.applicationId !== applicationId || previous.formType !== formType) throw new AppError('VALIDATION_FAILED');
    logger.info(`${event}.duplicate`, { recordId: previous.id, applicationId });
    return { kind: 'duplicate', formSubmissionId: previous.id };
  }

  const application = await twenty.findApplicationForLink(applicationId);
  if (!application) {
    logger.warn(`${event}.not_found`, { applicationId });
    return { kind: 'not_found' };
  }
  const used = await twenty.findFormSubmissionFor(applicationId, formType);
  if (used) {
    logger.info(`${event}.used`, { recordId: used.id, applicationId });
    return { kind: 'used' };
  }

  const form = buildLinkForm(formType, application.positionAppliedFor);
  const parsed = linkFormSchema(form, { applicantEmail: application.person?.emails?.primaryEmail ?? '' }).safeParse(body);
  if (!parsed.success) {
    logger.info(`${event}.invalid`, { applicationId, code: 'VALIDATION_FAILED' });
    return { kind: 'invalid', fields: fieldErrors(parsed.error) };
  }
  const data = parsed.data as LinkFormData;

  // Form 3: one Reference per entry, reused when a failed earlier attempt already saved it.
  for (const key of data.references ? REFERENCE_KEYS : []) {
    const ref = data.references![key];
    const existing = await twenty.findReferenceFor(applicationId, ref.email);
    const { id } =
      existing ??
      (await twenty.createReference({
        name: ref.fullName,
        title: ref.title,
        organization: ref.organization,
        relationship: ref.relationship,
        email: { primaryEmail: ref.email, additionalEmails: [] },
        ...(ref.phone && {
          phone: {
            primaryPhoneNumber: ref.phone.nationalNumber,
            primaryPhoneCountryCode: ref.phone.countryCode,
            primaryPhoneCallingCode: ref.phone.callingCode,
            additionalPhones: [],
          },
        }),
        knownDuration: ref.knownDuration,
        applicationId,
      }));
    logger.info(`${event}.reference_saved`, { recordId: id, applicationId, code: existing ? 'REFERENCE_REUSED' : 'REFERENCE_CREATED' });
  }

  const name = application.person?.name;
  const fullName = [name?.firstName, name?.lastName].filter(Boolean).join(' ');
  const input: FormSubmissionInput = {
    name: `${LINK_FORM_TYPES[formType].label}${fullName ? ` - ${fullName}` : ''}`.slice(0, 250),
    formType,
    tracks: [...form.tracks],
    formVersion: form.version,
    submittedAt: now().toISOString(),
    submissionKey: data.submissionKey,
    answers: { ...data.answers, ...(data.references && { references: data.references }) },
    answersSummary: { markdown: renderLinkFormSummary(form, data) },
    ...(typedFieldValues(form, data.answers) as Partial<FormSubmissionInput>),
    applicationId,
  };
  const { id } = await twenty.createFormSubmission(input);
  logger.info(`${event}.created`, { recordId: id, applicationId });
  return { kind: 'created', formSubmissionId: id };
}

export function createLinkFormHandler(formType: LinkFormType, deps: LinkFormDeps) {
  // Two tabs (or a double click with a new key) must not both pass the "already used?" check.
  const queue = keyedQueue();
  const event = `form_submission.${formType.toLowerCase()}`;

  return async function handle(request: Request): Promise<Response> {
    const started = Date.now();
    try {
      const { response: limited, ip } = checkIpLimit(request, deps, `${event}.rate_limited`);
      if (limited) return limited;

      const body = await readJsonObject(request, MAX_BODY_BYTES);
      if (!deps.secret) {
        deps.logger.error(`${event}.not_configured`, { code: 'LINK_TOKEN_SECRET_MISSING' });
        throw new AppError('INTERNAL');
      }
      const link = verifyLinkToken(body.token, deps.secret, formType);
      if (!link.ok) {
        deps.logger.warn(`${event}.link_invalid`, { code: link.code });
        const { status, body: error } = toPublicError(new AppError(link.code === 'EXPIRED' ? 'LINK_EXPIRED' : 'LINK_INVALID'));
        return json(status, error);
      }
      if (!submissionKeySchema.safeParse(body.submissionKey).success) {
        return validationFailed({ submissionKey: 'This form could not be sent. Please reload the page and try again.' });
      }

      const blocked = await checkLimitAndHuman(
        `application:${link.applicationId}`,
        'RATE_LIMIT_APPLICATION',
        body.turnstileToken,
        ip,
        deps,
        `${event}.blocked`,
      );
      if (blocked) return blocked;

      const outcome = await queue(`${link.applicationId}:${formType}`, () => submitLinkForm(formType, link.applicationId, body, deps));
      switch (outcome.kind) {
        case 'created':
          return json(201, { formSubmissionId: outcome.formSubmissionId });
        case 'duplicate':
          return json(200, { formSubmissionId: outcome.formSubmissionId });
        case 'invalid':
          return validationFailed(outcome.fields);
        case 'used':
        case 'not_found': {
          const { status, body: error } = toPublicError(new AppError(outcome.kind === 'used' ? 'ALREADY_SUBMITTED' : 'LINK_INVALID'));
          return json(status, error);
        }
      }
    } catch (error) {
      return failure(deps.logger, `${event}.failed`, error, started);
    }
  };
}
