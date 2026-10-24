import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv, TURNSTILE_TEST_KEYS } from './env';

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

  it('uses the Cloudflare Turnstile test keys outside production when none are set', () => {
    const env = parseEnv({ TWENTY_BASE_URL: 'https://crm.example.com', TWENTY_API_KEY: validKey });
    expect([env.TURNSTILE_SITE_KEY, env.TURNSTILE_SECRET_KEY]).toEqual([TURNSTILE_TEST_KEYS.siteKey, TURNSTILE_TEST_KEYS.secretKey]);
  });

  it('requires real Turnstile keys and the link secret in production', () => {
    const production = { NODE_ENV: 'production', TWENTY_BASE_URL: 'https://crm.example.com', TWENTY_API_KEY: validKey };
    try {
      parseEnv(production);
      expect.unreachable();
    } catch (error) {
      expect((error as EnvError).invalidVariables).toEqual(['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'LINK_TOKEN_SECRET']);
    }
    const env = parseEnv({
      ...production,
      TURNSTILE_SITE_KEY: '0x4AAAAAAAreal',
      TURNSTILE_SECRET_KEY: '0x4AAAAAAAsecret',
      LINK_TOKEN_SECRET: 's'.repeat(32),
    });
    expect(env.TURNSTILE_SITE_KEY).toBe('0x4AAAAAAAreal');
  });

  it('only accepts known proxy headers for the client IP', () => {
    const base = { TWENTY_BASE_URL: 'https://crm.example.com', TWENTY_API_KEY: validKey };
    expect(parseEnv({ ...base, TRUSTED_IP_HEADER: 'cf-connecting-ip' }).TRUSTED_IP_HEADER).toBe('cf-connecting-ip');
    expect(() => parseEnv({ ...base, TRUSTED_IP_HEADER: 'x-anything' })).toThrow(/TRUSTED_IP_HEADER/);
  });

  it('rejects a link secret shorter than 32 characters', () => {
    expect(() => parseEnv({ TWENTY_BASE_URL: 'https://crm.example.com', TWENTY_API_KEY: validKey, LINK_TOKEN_SECRET: 'short' })).toThrow(/LINK_TOKEN_SECRET/);
  });
});
