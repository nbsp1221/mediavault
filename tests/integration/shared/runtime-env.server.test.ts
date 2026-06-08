import { afterEach, describe, expect, test } from 'vitest';
import {
  getAuthClientIdentityConfig,
  getAuthConfig,
  getMediaKeyDerivationConfig,
  getMediaPackagingConfig,
  getPrimaryStorageConfig,
  getRuntimeConfig,
} from '../../../app/shared/config/app-config.server';

const originalDatabaseEncryptionKey = process.env.MEDIAVAULT_DATABASE_ENCRYPTION_KEY;
const originalStorageDir = process.env.MEDIAVAULT_STORAGE_DIR;

afterEach(() => {
  if (originalDatabaseEncryptionKey === undefined) {
    delete process.env.MEDIAVAULT_DATABASE_ENCRYPTION_KEY;
  }
  else {
    process.env.MEDIAVAULT_DATABASE_ENCRYPTION_KEY = originalDatabaseEncryptionKey;
  }

  if (originalStorageDir === undefined) {
    delete process.env.MEDIAVAULT_STORAGE_DIR;
  }
  else {
    process.env.MEDIAVAULT_STORAGE_DIR = originalStorageDir;
  }
});

describe('runtime env config boundary', () => {
  test('uses injected env maps without reading ambient process state', () => {
    process.env.MEDIAVAULT_DATABASE_ENCRYPTION_KEY = 'ambient-db-key';
    process.env.MEDIAVAULT_STORAGE_DIR = '/tmp/ambient-storage';

    const config = getPrimaryStorageConfig({
      MEDIAVAULT_DATABASE_ENCRYPTION_KEY: 'injected-db-key',
      MEDIAVAULT_STORAGE_DIR: '/tmp/injected-storage',
    });

    expect(config.databaseEncryptionKey).toBe('injected-db-key');
    expect(config.storageDir).toBe('/tmp/injected-storage');
  });

  test('does not cache values between independent injected env maps', () => {
    const first = getAuthConfig({
      MEDIAVAULT_AUTH_CLIENT_COOKIE_NAME: 'client_cookie',
      MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS: '11',
      MEDIAVAULT_AUTH_SESSION_COOKIE_NAME: 'session_cookie',
      MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS: 'true',
      NODE_ENV: 'production',
    });
    const second = getAuthConfig({
      MEDIAVAULT_AUTH_CLIENT_COOKIE_NAME: 'client_cookie',
      MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS: '22',
      MEDIAVAULT_AUTH_SESSION_COOKIE_NAME: 'session_cookie',
      MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS: 'false',
      NODE_ENV: 'development',
    });

    expect(first.failedLoginDelayMs).toBe(11);
    expect(first.sessionCookieSecure).toBe(true);
    expect(first.trustProxyHeaders).toBe(true);
    expect(second.failedLoginDelayMs).toBe(22);
    expect(second.sessionCookieSecure).toBe(false);
    expect(second.trustProxyHeaders).toBe(false);
  });

  test('keeps secret values out of validation errors', () => {
    expect(() => getMediaKeyDerivationConfig({
      MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET: '   ',
    })).toThrow('MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET environment variable is required for video encryption');

    expect(() => getMediaKeyDerivationConfig({
      MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET: '   ',
    })).not.toThrow('secret');
  });

  test('parses media packaging segment duration in one config boundary', () => {
    expect(getMediaPackagingConfig({
      DASH_SEGMENT_DURATION: '6',
    })).toEqual({
      segmentDuration: 6,
    });
    expect(getMediaPackagingConfig({
      DASH_SEGMENT_DURATION: '   ',
    })).toEqual({
      segmentDuration: 10,
    });
    expect(getMediaPackagingConfig({})).toEqual({
      segmentDuration: 10,
    });
  });

  test.each([
    '0',
    '-1',
    '1.5',
    '6seconds',
  ])('rejects invalid explicit DASH_SEGMENT_DURATION=%s', (value) => {
    expect(() => getMediaPackagingConfig({
      DASH_SEGMENT_DURATION: value,
    })).toThrow('DASH_SEGMENT_DURATION');
    expect(() => getMediaPackagingConfig({
      DASH_SEGMENT_DURATION: value,
    })).not.toThrow(value);
  });

  test('rejects invalid runtime mode values from explicit env maps', () => {
    expect(() => getRuntimeConfig({
      NODE_ENV: 'prod',
    })).toThrow('NODE_ENV');
    expect(() => getRuntimeConfig({
      NODE_ENV: 'staging-secret',
    })).not.toThrow('staging-secret');
  });

  test('reads runtime mode without validating unrelated settings', () => {
    expect(getRuntimeConfig({
      DASH_SEGMENT_DURATION: 'bad',
      NODE_ENV: 'development',
    })).toEqual({
      isProductionRuntime: false,
      nodeEnv: 'development',
    });
  });

  test('rejects partial numeric parsing for every runtime numeric key', () => {
    const invalidNumericInputs: Array<{
      key: string;
      read: (env: Record<string, string>) => unknown;
      value: string;
    }> = [
      {
        key: 'DASH_SEGMENT_DURATION',
        read: getMediaPackagingConfig,
        value: '6seconds',
      },
      {
        key: 'MEDIAVAULT_AUTH_FAILED_LOGIN_BLOCK_DURATION_MS',
        read: getAuthConfig,
        value: '10abc',
      },
      {
        key: 'MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS',
        read: getAuthConfig,
        value: '1.5',
      },
      {
        key: 'MEDIAVAULT_AUTH_FAILED_LOGIN_WINDOW_MS',
        read: getAuthConfig,
        value: '1e3',
      },
      {
        key: 'MEDIAVAULT_AUTH_MAX_FAILED_LOGIN_ATTEMPTS',
        read: getAuthConfig,
        value: 'Infinity',
      },
      {
        key: 'MEDIAVAULT_AUTH_SESSION_TTL_MS',
        read: getAuthConfig,
        value: 'NaN',
      },
    ];

    for (const { key, read, value } of invalidNumericInputs) {
      expect(() => read({
        [key]: value,
      })).toThrow(key);
      expect(() => read({
        [key]: value,
      })).not.toThrow(value);
    }
  });

  test('requires an explicit auth client cookie signing secret', () => {
    const explicit = getAuthClientIdentityConfig({
      MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET: ' explicit-secret ',
    });

    expect(() => getAuthClientIdentityConfig({})).toThrow('MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET');
    expect(explicit.clientCookieSigningSecret).toBe('explicit-secret');
  });

  test('exposes runtime mode flags from explicit env maps', () => {
    expect(getRuntimeConfig({
      NODE_ENV: 'production',
    })).toEqual(expect.objectContaining({
      isProductionRuntime: true,
    }));
  });
});
