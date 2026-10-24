import { describe, expect, it } from 'vitest';
import { createLogger, type LogFields } from './logger';

const ID = '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b';
const EMAIL = 'jane.doe+test@example.com';
const PHONE = '+1 512 555 0142';

function capture() {
  const lines: string[] = [];
  return { logger: createLogger((line) => lines.push(line)), lines };
}

describe('logger', () => {
  it('writes one JSON line with level, event, IDs, codes and numbers', () => {
    const { logger, lines } = capture();
    logger.info('application.created', { applicationId: ID, op: 'twenty.createApplication', status: 201, durationMs: 42 });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: 'info',
      event: 'application.created',
      applicationId: ID,
      op: 'twenty.createApplication',
      status: 201,
      durationMs: 42,
    });
  });

  it('never writes emails or phone numbers, even when passed into ID or code fields', () => {
    const { logger, lines } = capture();
    const smuggled = { personId: EMAIL, code: PHONE, op: EMAIL, requestId: PHONE } as LogFields;
    logger.error('person.lookup_failed', smuggled);
    logger.warn(`lookup failed for ${EMAIL}`);

    const output = lines.join('\n');
    expect(output).not.toContain(EMAIL);
    expect(output).not.toContain('example.com');
    expect(output).not.toContain(PHONE);
    expect(output).not.toMatch(/555/);
    expect(JSON.parse(lines[0]!)).toMatchObject({ personId: '[redacted]', code: '[redacted]', op: '[redacted]' });
    expect(JSON.parse(lines[1]!).event).toBe('[redacted]');
  });

  it('drops fields that are not on the allow-list', () => {
    const { logger, lines } = capture();
    logger.info('form.submitted', { firstName: 'Jane', email: EMAIL, answers: { G4: 'text' } } as unknown as LogFields);
    const entry = JSON.parse(lines[0]!);
    expect(Object.keys(entry).sort()).toEqual(['event', 'level', 'ts']);
  });
});
