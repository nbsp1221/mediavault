import { describe, expect, test } from 'vitest';

async function importAuthClientIdentity() {
  return import('../../../app/composition/server/auth-client-identity');
}

describe('auth-client identity helpers', () => {
  test('uses the leftmost X-Forwarded-For hop as the trusted IP fallback when proxy trust is enabled', async () => {
    process.env.MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS = 'true';

    const { getLoginAttemptKey, getTrustedClientIP } = await importAuthClientIdentity();

    const request = new Request('http://localhost/api/auth/login', {
      headers: {
        'X-Forwarded-For': '198.51.100.24, 203.0.113.10',
      },
    });

    expect(getTrustedClientIP(request)).toBe('198.51.100.24');
    expect(getLoginAttemptKey(request)).toBe('ip:198.51.100.24');
  });

  test('prefers a valid signed client cookie over trusted proxy headers', async () => {
    process.env.MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS = 'true';

    const {
      createAuthClientCookieHeader,
      getLoginAttemptKey,
    } = await importAuthClientIdentity();

    const clientCookie = createAuthClientCookieHeader('client-123');
    const cookieValue = clientCookie.split(';')[0];
    const request = new Request('http://localhost/api/auth/login', {
      headers: {
        'X-Real-IP': '203.0.113.10',
        'cookie': cookieValue ?? '',
      },
    });

    expect(getLoginAttemptKey(request)).toBe('client:client-123');
  });

  test('ignores malformed auth-client cookies and falls back to anonymous identity', async () => {
    delete process.env.MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS;

    const {
      getAuthClientId,
      getLoginAttemptKey,
    } = await importAuthClientIdentity();

    const request = new Request('http://localhost/api/auth/login', {
      headers: {
        cookie: '__Host-mediavault-client=%E0%A4%A',
      },
    });

    expect(getAuthClientId(request)).toBeNull();
    expect(getLoginAttemptKey(request)).toBe('anonymous');
  });
});
