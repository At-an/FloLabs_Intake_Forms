import 'server-only';
import { applicationSchema, fieldErrors } from '@/shared/forms/application';
import { CV_MESSAGES, MAX_CV_BYTES } from '@/shared/forms/cv';
import { AppError, errorCodeOf, toPublicError } from '../errors';
import { clientIp, type RateLimiter } from '../rate-limit';
import type { VerifyHuman } from '../turnstile';
import { TwentyError } from '../twenty/client';
import { checkCv } from './cv';
import { submitApplication, type SubmitDeps, type SubmitResult } from './submit';

// POST /api/applications as multipart/form-data: `data` = JSON of the form fields (incl. `site`
// and `turnstileToken`), `cv` = the CV file.
// Order (CLAUDE.md rule 5): IP limit -> local validation -> email limit -> Turnstile -> Twenty.

const MAX_DATA_BYTES = 32 * 1024;
const MAX_REQUEST_BYTES = MAX_CV_BYTES + MAX_DATA_BYTES + 64 * 1024; // CV + fields + multipart overhead

export type HandlerDeps = SubmitDeps & {
  verifyHuman: VerifyHuman;
  ipLimiter: RateLimiter;
  emailLimiter: RateLimiter;
  trustedIpHeader?: string;
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

function validationFailed(fields?: Partial<Record<string, string>>) {
  const { status, body } = toPublicError(new AppError('VALIDATION_FAILED'));
  // Field messages come from our own rules, never from input or upstream systems.
  return json(status, { error: { ...body.error, ...(fields && { fields }) } });
}

function rateLimited(retryAfterSeconds: number) {
  const { status, body } = toPublicError(new AppError('RATE_LIMITED'));
  return json(status, body, { 'Retry-After': String(retryAfterSeconds) });
}

export function createApplicationsHandler(deps: HandlerDeps) {
  // Simultaneous requests with the same submissionKey share one result, so the
  // duplicate check in submitApplication cannot be raced within this server.
  const inFlight = new Map<string, Promise<SubmitResult>>();

  return async function handle(request: Request): Promise<Response> {
    const started = Date.now();
    try {
      const ip = clientIp(request, deps.trustedIpHeader);
      const ipCheck = deps.ipLimiter.hit(`ip:${ip ?? 'unknown'}`);
      if (!ipCheck.allowed) {
        deps.logger.warn('application.rate_limited', { code: 'RATE_LIMIT_IP' });
        return rateLimited(ipCheck.retryAfterSeconds);
      }

      if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
        throw new AppError('VALIDATION_FAILED');
      }
      const declaredLength = Number(request.headers.get('content-length') ?? '0');
      if (declaredLength > MAX_REQUEST_BYTES) return validationFailed({ cv: CV_MESSAGES.tooLarge });

      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        throw new AppError('VALIDATION_FAILED');
      }

      const raw = form.get('data');
      if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_DATA_BYTES) {
        throw new AppError('VALIDATION_FAILED');
      }
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new AppError('VALIDATION_FAILED');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('VALIDATION_FAILED');

      const cvEntry = form.get('cv');
      const [parsed, cvCheck] = await Promise.all([
        Promise.resolve(applicationSchema.safeParse(body)),
        checkCv(cvEntry instanceof File ? cvEntry : null),
      ]);
      if (!parsed.success || !cvCheck.ok) {
        deps.logger.info('application.invalid', { code: 'VALIDATION_FAILED', durationMs: Date.now() - started });
        return validationFailed({
          ...(parsed.success ? {} : fieldErrors(parsed.error)),
          ...(!cvCheck.ok && { cv: cvCheck.message }),
        });
      }

      const emailCheck = deps.emailLimiter.hit(`email:${parsed.data.email}`);
      if (!emailCheck.allowed) {
        deps.logger.warn('application.rate_limited', { code: 'RATE_LIMIT_EMAIL' });
        return rateLimited(emailCheck.retryAfterSeconds);
      }

      const { site, turnstileToken } = body as { site?: unknown; turnstileToken?: unknown };
      const human = await deps.verifyHuman(turnstileToken, ip);
      if (!human.ok) {
        deps.logger.warn('application.bot_check_failed', { code: human.code });
        throw new AppError('BOT_CHECK_FAILED');
      }

      const key = parsed.data.submissionKey;
      let pending = inFlight.get(key);
      if (!pending) {
        pending = submitApplication(parsed.data, typeof site === 'string' ? site : undefined, cvCheck.cv, deps);
        inFlight.set(key, pending);
        pending.finally(() => inFlight.delete(key)).catch(() => {});
      }
      const result = await pending;

      deps.logger.info('application.request_done', {
        applicationId: result.applicationId,
        status: result.duplicate ? 200 : 201,
        durationMs: Date.now() - started,
      });
      return json(result.duplicate ? 200 : 201, { applicationId: result.applicationId });
    } catch (error) {
      deps.logger.error('application.failed', {
        code: error instanceof TwentyError ? error.code : errorCodeOf(error),
        op: error instanceof TwentyError ? error.op : undefined,
        status: error instanceof TwentyError ? error.status : undefined,
        durationMs: Date.now() - started,
      });
      const { status, body } = toPublicError(error);
      return json(status, body);
    }
  };
}
