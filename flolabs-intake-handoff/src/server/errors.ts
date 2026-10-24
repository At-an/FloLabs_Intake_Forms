import 'server-only';
import { TwentyError } from './twenty/client';

// Central error mapper: users only ever see these generic messages (CLAUDE.md rule 7).

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'BOT_CHECK_FAILED'
  | 'RATE_LIMITED'
  | 'FORM_NOT_AVAILABLE'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL';

const PUBLIC_ERRORS: Record<ErrorCode, { status: number; message: string }> = {
  VALIDATION_FAILED: { status: 400, message: 'Please check the highlighted fields and try again.' },
  BOT_CHECK_FAILED: { status: 403, message: 'We could not verify your submission. Please try again.' },
  RATE_LIMITED: { status: 429, message: 'Too many attempts. Please wait a moment and try again.' },
  FORM_NOT_AVAILABLE: { status: 403, message: 'This form is not available on this website.' },
  UPSTREAM_UNAVAILABLE: { status: 502, message: 'We could not save your submission right now. Please try again later.' },
  INTERNAL: { status: 500, message: 'Something went wrong. Please try again later.' },
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = 'AppError';
  }
}

export type PublicError = { status: number; body: { error: { code: ErrorCode; message: string } } };

export function errorCodeOf(error: unknown): ErrorCode {
  if (error instanceof AppError) return error.code;
  if (error instanceof TwentyError) return 'UPSTREAM_UNAVAILABLE';
  return 'INTERNAL';
}

export function toPublicError(error: unknown): PublicError {
  const code = errorCodeOf(error);
  const { status, message } = PUBLIC_ERRORS[code];
  return { status, body: { error: { code, message } } };
}
