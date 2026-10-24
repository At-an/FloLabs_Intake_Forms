import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env';

const validKey = 'k'.repeat(40);

describe('parseEnv', () => {
  it('accepts a valid environment and strips trailing slashes from the base URL', () => {
    const env = parseEnv({ TWENTY_BASE_URL: 'https://crm.example.com//', TWENTY_API_KEY: validKey });
    expect(env.TWENTY_BASE_URL).toBe('https://crm.example.com');
  });

  it('names every missing variable', () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    try {
      parseEnv({});
    } catch (error) {
      expect((error as EnvError).invalidVariables).toEqual(['TWENTY_BASE_URL', 'TWENTY_API_KEY']);
    }
  });

  it('rejects a non-https base URL', () => {
    expect(() => parseEnv({ TWENTY_BASE_URL: 'http://crm.example.com', TWENTY_API_KEY: validKey })).toThrow(
      /TWENTY_BASE_URL/,
    );
  });

  it('never includes variable values in the error', () => {
    const secret = 'short-secret-value';
    try {
      parseEnv({ TWENTY_BASE_URL: 'not a url', TWENTY_API_KEY: secret });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(secret);
      expect(String((error as Error).message)).not.toContain('not a url');
    }
  });
});
