import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { rejectCrossOriginMutation } from '~/shared/lib/http/csrf.server';

function forwardedRequest(origin: string, extraHeaders: Record<string, string> = {}) {
  return new Request('http://mediavault:3000/api/auth/login', {
    method: 'POST',
    headers: {
      'Origin': origin,
      'Sec-Fetch-Site': 'same-origin',
      'X-Forwarded-Proto': 'https',
      'X-Forwarded-Host': 'vault.example',
      ...extraHeaders,
    },
  });
}

describe('Caddy public-origin CSRF contract', () => {
  beforeEach(() => {
    vi.stubEnv('MEDIAVAULT_PUBLIC_ORIGIN', undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('does not trust forwarded origin headers by default', () => {
    expect(rejectCrossOriginMutation(forwardedRequest('https://vault.example'))?.status).toBe(403);
    expect(rejectCrossOriginMutation(forwardedRequest('http://mediavault:3000'))).toBeNull();
  });

  test('accepts the configured external HTTPS origin over an internal HTTP request', () => {
    vi.stubEnv('MEDIAVAULT_PUBLIC_ORIGIN', 'https://vault.example');
    expect(rejectCrossOriginMutation(forwardedRequest('https://vault.example'))).toBeNull();
    expect(rejectCrossOriginMutation(forwardedRequest('http://mediavault:3000'))?.status).toBe(403);
  });

  test('cannot replace a configured origin with spoofed forwarding headers', () => {
    vi.stubEnv('MEDIAVAULT_PUBLIC_ORIGIN', 'https://vault.example');
    expect(
      rejectCrossOriginMutation(
        forwardedRequest('https://evil.example', {
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-Host': 'evil.example',
        }),
      )?.status,
    ).toBe(403);
  });

  test('retains fetch metadata rejection even for the configured origin', () => {
    vi.stubEnv('MEDIAVAULT_PUBLIC_ORIGIN', 'https://vault.example');
    expect(
      rejectCrossOriginMutation(
        forwardedRequest('https://vault.example', { 'Sec-Fetch-Site': 'cross-site' }),
      )?.status,
    ).toBe(403);
  });

  test('uses the configured origin for the Referer fallback too', () => {
    vi.stubEnv('MEDIAVAULT_PUBLIC_ORIGIN', 'https://vault.example');
    const request = forwardedRequest('https://vault.example');
    request.headers.delete('Origin');
    request.headers.set('Referer', 'https://vault.example/login');
    expect(rejectCrossOriginMutation(request)).toBeNull();
    request.headers.set('Referer', 'http://mediavault:3000/login');
    expect(rejectCrossOriginMutation(request)?.status).toBe(403);
  });
});
