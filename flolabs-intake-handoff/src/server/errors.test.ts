import { describe, expect, it } from 'vitest';
import { AppError, toPublicError } from './errors';
import { TwentyError } from './twenty/client';

describe('toPublicError', () => {
  it('maps an AppError to its status and generic message', () => {
    expect(toPublicError(new AppError('RATE_LIMITED'))).toEqual({
      status: 429,
      body: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a moment and try again.' } },
    });
  });

  it('maps Twenty failures to a generic 502 without internal details', () => {
    const result = toPublicError(new TwentyError('twenty.createApplication', 400, 'BAD_USER_INPUT'));
    expect(result.status).toBe(502);
    expect(result.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(JSON.stringify(result)).not.toMatch(/twenty\.|BAD_USER_INPUT|400/);
  });

  it('maps anything else to a generic 500 and never echoes the original message', () => {
    const result = toPublicError(new Error('connect ECONNREFUSED jane.doe@example.com stack trace'));
    expect(result).toEqual({
      status: 500,
      body: { error: { code: 'INTERNAL', message: 'Something went wrong. Please try again later.' } },
    });
  });
});
