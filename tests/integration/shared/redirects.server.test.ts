import { describe, expect, test } from 'vitest';
import { getSafeRedirectTarget } from '~/shared/lib/http/redirects.server';

describe('relative authentication redirects', () => {
  test.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
  ])('rejects externally resolved target %s', (target) => {
    const request = new Request(
      `http://mediavault:3000/api/auth/logout?${new URLSearchParams({ redirectTo: target })}`,
    );
    expect(getSafeRedirectTarget(request, '/login')).toBe('/login');
  });
  test('returns a relative path, query and fragment without an internal HTTP origin', () => {
    const request = new Request(
      `http://mediavault:3000/api/auth/logout?${new URLSearchParams({ redirectTo: '/videos?public=true#top' })}`,
    );
    expect(getSafeRedirectTarget(request, '/login')).toBe('/videos?public=true#top');
  });
});
