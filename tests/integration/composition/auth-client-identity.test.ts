import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

async function importAuthClientIdentity() {
  return import('../../../app/composition/server/auth-client-identity');
}

describe('auth-client identity helpers', () => {
  beforeEach(() => {
    process.env.MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET = 'auth-client-identity-secret-012345';
    delete process.env.MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS;
    vi.resetModules();
  });
  afterEach(() => {
    delete process.env.MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET;
    delete process.env.MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS;
    vi.resetModules();
  });

  test('uses only the Caddy-owned X-Forwarded-For header when explicitly trusted', async () => {
    process.env.MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS = 'true';
    const { getLoginAttemptKeys, getTrustedClientIP } = await importAuthClientIdentity();
    const request = new Request('http://localhost/api/auth/login', {
      headers: {
        'X-Forwarded-For': '198.51.100.24, 203.0.113.10',
        'CF-Connecting-IP': '192.0.2.1',
        'X-Real-IP': '192.0.2.2',
        'Forwarded': 'for=192.0.2.3',
      },
    });
    expect(getTrustedClientIP(request)).toBe('198.51.100.24');
    expect(getLoginAttemptKeys(request)).toEqual(['ip:198.51.100.24']);
  });

  test('retains signed client and trusted IP keys without any shared unknown identity', async () => {
    process.env.MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS = 'true';
    const { createAuthClientCookieHeader, getLoginAttemptKeys } = await importAuthClientIdentity();
    const cookie = createAuthClientCookieHeader('client-123').split(';')[0];
    if (!cookie) {
      throw new Error('Expected client cookie');
    }
    const request = new Request('http://localhost/api/auth/login', {
      headers: { 'X-Forwarded-For': '203.0.113.10', cookie },
    });
    expect(getLoginAttemptKeys(request)).toEqual(['client:client-123', 'ip:203.0.113.10']);
  });

  test('ignores forwarded IP spoofing when proxy trust is off', async () => {
    const { getLoginAttemptKeys, getTrustedClientIP } = await importAuthClientIdentity();
    const request = new Request('http://localhost/api/auth/login', {
      headers: { 'X-Forwarded-For': '198.51.100.24', 'CF-Connecting-IP': '192.0.2.1' },
    });
    expect(getTrustedClientIP(request)).toBeUndefined();
    expect(getLoginAttemptKeys(request)).toEqual([]);
  });

  test('does not interpret unrelated forwarding headers as a trusted client IP', async () => {
    process.env.MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS = 'true';
    const { getLoginAttemptKeys, getTrustedClientIP } = await importAuthClientIdentity();
    const request = new Request('http://localhost/api/auth/login', {
      headers: {
        'CF-Connecting-IP': '192.0.2.1',
        'X-Real-IP': '192.0.2.2',
        'Forwarded': 'for=192.0.2.3',
      },
    });
    expect(getTrustedClientIP(request)).toBeUndefined();
    expect(getLoginAttemptKeys(request)).toEqual([]);
  });

  test('ignores malformed client cookies without creating an anonymous bucket', async () => {
    const { getAuthClientId, getLoginAttemptKeys } = await importAuthClientIdentity();
    const request = new Request('http://localhost/api/auth/login', {
      headers: { cookie: '__Host-mediavault-client=%E0%A4%A' },
    });
    expect(getAuthClientId(request)).toBeNull();
    expect(getLoginAttemptKeys(request)).toEqual([]);
  });
});
