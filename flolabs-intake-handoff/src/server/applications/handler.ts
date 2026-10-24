import 'server-only';
import { applicationSchema, fieldErrors } from '@/shared/forms/application';
import { AppError, errorCodeOf, toPublicError } from '../errors';
import { TwentyError } from '../twenty/client';
import { submitApplication, type SubmitDeps } from './submit';

// POST /api/applications. Turnstile and rate limits are added in T7 and must run
// before submitApplication (CLAUDE.md rule 5); CV upload is added in T6c.

const MAX_BODY_BYTES = 32 * 1024;

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function createApplicationsHandler(deps: SubmitDeps) {
  return async function handle(request: Request): Promise<Response> {
    const started = Date.now();
    try {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        throw new AppError('VALIDATION_FAILED');
      }
      const text = await request.text();
      if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new AppError('VALIDATION_FAILED');

      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new AppError('VALIDATION_FAILED');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('VALIDATION_FAILED');

      const parsed = applicationSchema.safeParse(body);
      if (!parsed.success) {
        deps.logger.info('application.invalid', { code: 'VALIDATION_FAILED', durationMs: Date.now() - started });
        const { status, body: errorBody } = toPublicError(new AppError('VALIDATION_FAILED'));
        // Field messages come from our own schema, never from input or upstream systems.
        return json(status, { error: { ...errorBody.error, fields: fieldErrors(parsed.error) } });
      }

      const site = (body as { site?: unknown }).site;
      const result = await submitApplication(parsed.data, typeof site === 'string' ? site : undefined, deps);
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
