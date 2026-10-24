import 'server-only';
import { applicationSchema, fieldErrors } from '@/shared/forms/application';
import { CV_MESSAGES, MAX_CV_BYTES } from '@/shared/forms/cv';
import { AppError, errorCodeOf, toPublicError } from '../errors';
import { TwentyError } from '../twenty/client';
import { checkCv } from './cv';
import { submitApplication, type SubmitDeps } from './submit';

// POST /api/applications as multipart/form-data: `data` = JSON of the form fields (incl. `site`),
// `cv` = the CV file. Turnstile and rate limits are added in T7 and must run before
// submitApplication (CLAUDE.md rule 5).

const MAX_DATA_BYTES = 32 * 1024;
const MAX_REQUEST_BYTES = MAX_CV_BYTES + MAX_DATA_BYTES + 64 * 1024; // CV + fields + multipart overhead

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function validationFailed(fields?: Partial<Record<string, string>>) {
  const { status, body } = toPublicError(new AppError('VALIDATION_FAILED'));
  // Field messages come from our own rules, never from input or upstream systems.
  return json(status, { error: { ...body.error, ...(fields && { fields }) } });
}

export function createApplicationsHandler(deps: SubmitDeps) {
  return async function handle(request: Request): Promise<Response> {
    const started = Date.now();
    try {
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

      const site = (body as { site?: unknown }).site;
      const result = await submitApplication(parsed.data, typeof site === 'string' ? site : undefined, cvCheck.cv, deps);
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
