import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './normalize';

describe('normalizeEmail', () => {
  it('trims and lowercases without altering plus tags', () => {
    expect(normalizeEmail('  Person+Tag@Example.COM ')).toBe('person+tag@example.com');
  });

  it.each(['', 'not-an-email', 'person@', '@example.com', 'person @example.com', 'x'.repeat(250) + '@a.com'])(
    'rejects invalid email input',
    (email) => expect(() => normalizeEmail(email)).toThrow('INVALID_EMAIL'),
  );
});
