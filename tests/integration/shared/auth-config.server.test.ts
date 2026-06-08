import { afterEach, describe, expect, test } from 'vitest';
import {
  getAuthConfig,
  getAuthCookieConfig,
  getAuthRateLimitConfig,
} from '../../../app/shared/config/app-config.server';

const envKeys = [
  'MEDIAVAULT_AUTH_CLIENT_COOKIE_NAME',
  'MEDIAVAULT_AUTH_FAILED_LOGIN_BLOCK_DURATION_MS',
  'MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS',
  'MEDIAVAULT_AUTH_FAILED_LOGIN_WINDOW_MS',
  'MEDIAVAULT_AUTH_MAX_FAILED_LOGIN_ATTEMPTS',
  'MEDIAVAULT_AUTH_SESSION_COOKIE_NAME',
  'MEDIAVAULT_AUTH_SESSION_TTL_MS',
  'MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS',
  'NODE_ENV',
] as const;

const originalEnv = new Map<string, string | undefined>();

for (const key of envKeys) {
  originalEnv.set(key, process.env[key]);
}

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    }
    else {
      process.env[key] = value;
    }
  }
});

describe('auth server config', () => {
  test('uses secure production cookies and custom cookie names', () => {
    process.env.NODE_ENV = 'production';
    process.env.MEDIAVAULT_AUTH_CLIENT_COOKIE_NAME = 'client_cookie';
    process.env.MEDIAVAULT_AUTH_SESSION_COOKIE_NAME = 'session_cookie';
    process.env.MEDIAVAULT_AUTH_SESSION_TTL_MS = '1234';

    expect(getAuthCookieConfig()).toEqual({
      clientCookieName: 'client_cookie',
      sessionCookieName: 'session_cookie',
      sessionCookiePath: '/',
      sessionCookieSecure: true,
      sessionTtlMs: 1234,
    });
  });

  test('uses defaults for blank numeric settings', () => {
    process.env.NODE_ENV = 'development';
    process.env.MEDIAVAULT_AUTH_CLIENT_COOKIE_NAME = 'client_cookie';
    process.env.MEDIAVAULT_AUTH_SESSION_COOKIE_NAME = 'session_cookie';
    process.env.MEDIAVAULT_AUTH_FAILED_LOGIN_BLOCK_DURATION_MS = '';
    process.env.MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS = '   ';
    process.env.MEDIAVAULT_AUTH_FAILED_LOGIN_WINDOW_MS = '';
    process.env.MEDIAVAULT_AUTH_MAX_FAILED_LOGIN_ATTEMPTS = '';
    process.env.MEDIAVAULT_AUTH_SESSION_TTL_MS = '';

    expect(getAuthConfig()).toEqual(expect.objectContaining({
      failedLoginBlockDurationMs: 300_000,
      failedLoginDelayMs: 750,
      failedLoginWindowMs: 300_000,
      maxFailedLoginAttempts: 5,
      sessionCookieSecure: false,
      sessionTtlMs: 604_800_000,
    }));
  });

  test.each([
    ['MEDIAVAULT_AUTH_FAILED_LOGIN_BLOCK_DURATION_MS', '0'],
    ['MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS', '-1'],
    ['MEDIAVAULT_AUTH_FAILED_LOGIN_WINDOW_MS', 'not-a-number'],
    ['MEDIAVAULT_AUTH_SESSION_TTL_MS', '10abc'],
    ['MEDIAVAULT_AUTH_SESSION_TTL_MS', '1.5'],
    ['MEDIAVAULT_AUTH_MAX_FAILED_LOGIN_ATTEMPTS', '1e3'],
  ] as const)('rejects invalid explicit numeric setting %s=%s', (key, value) => {
    process.env.NODE_ENV = 'development';
    process.env[key] = value;

    expect(() => getAuthConfig()).toThrow(key);
    expect(() => getAuthConfig()).not.toThrow(value);
  });

  test('uses secure cookies for default __Host-prefixed names', () => {
    process.env.NODE_ENV = 'development';

    expect(getAuthCookieConfig()).toEqual(expect.objectContaining({
      clientCookieName: '__Host-mediavault-client',
      sessionCookieName: '__Host-mediavault-session',
      sessionCookiePath: '/',
      sessionCookieSecure: true,
    }));
  });

  test.each([
    ['1', true],
    [' true ', true],
    ['YES', true],
    ['on', true],
    ['0', false],
    [' false ', false],
    ['NO', false],
    ['off', false],
  ])('parses MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS=%s', (value, expected) => {
    process.env.MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS = value;

    expect(getAuthRateLimitConfig()).toEqual({
      trustProxyHeaders: expected,
    });
  });

  test('rejects invalid explicit MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS values', () => {
    process.env.MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS = 'unexpected';

    expect(() => getAuthRateLimitConfig()).toThrow('MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS');
    expect(() => getAuthRateLimitConfig()).not.toThrow('unexpected');
  });
});
