import { CookieJar } from 'jsdom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { getCookieValue, serializeCookie } from '~/shared/lib/http/cookies.server';

const loginUrl = 'https://vault.example/account/login';

function requestWithCookies(header?: string) {
  return new Request(loginUrl, { headers: header === undefined ? undefined : { Cookie: header } });
}

describe('cookies.server', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns null when the header or the exact requested name is absent', () => {
    expect(getCookieValue(requestWithCookies(), 'fixture')).toBeNull();
    expect(getCookieValue(requestWithCookies(''), 'fixture')).toBeNull();
    expect(
      getCookieValue(requestWithCookies('fixture-extra=other; Fixture=different-case'), 'fixture'),
    ).toBeNull();
  });

  test('finds a named cookie among adjacent pairs without losing embedded equals or padding', () => {
    const request = requestWithCookies('unrelated=first; fixture=opaque=payload==; last=other');
    expect(getCookieValue(request, 'fixture')).toBe('opaque=payload==');
    expect(getCookieValue(request, 'last')).toBe('other');
  });

  test('decodes percent encoding without treating a literal plus as form whitespace', () => {
    expect(getCookieValue(requestWithCookies('fixture=one%3Dtwo%3Bthree%2Ffour'), 'fixture')).toBe(
      'one=two;three/four',
    );
    expect(getCookieValue(requestWithCookies('fixture=one+two'), 'fixture')).toBe('one+two');
    expect(getCookieValue(requestWithCookies('fixture='), 'fixture')).toBe('');
  });

  test.each(['%', '%ZZ', '%E0%A4%A'])(
    'fails closed for malformed percent encoding %#',
    (encoded) => {
      expect(getCookieValue(requestWithCookies(`fixture=${encoded}`), 'fixture')).toBeNull();
    },
  );

  test('does not authenticate a later duplicate after the first matching cookie is malformed', () => {
    expect(
      getCookieValue(
        requestWithCookies('fixture=%E0%A4%A; unrelated=value; fixture=later-valid'),
        'fixture',
      ),
    ).toBeNull();
    expect(
      getCookieValue(requestWithCookies('fixture=first-valid; fixture=later-valid'), 'fixture'),
    ).toBe('first-valid');
  });

  test('round-trips Unicode and reserved characters without injecting attributes or extra cookies', () => {
    const original = '표시 값+🔒=opaque; Domain=example; Path=/other';
    const jar = new CookieJar();
    const header = serializeCookie('fixture', original);
    jar.setCookieSync(header, loginUrl);
    const stored = jar.getCookiesSync(loginUrl);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.hostOnly).toBe(true);
    expect(stored[0]?.path).toBe('/');
    expect(getCookieValue(requestWithCookies(jar.getCookieStringSync(loginUrl)), 'fixture')).toBe(
      original,
    );
  });

  test('defaults to a root-scoped HttpOnly session cookie without invalid optional attributes', () => {
    const jar = new CookieJar();
    const header = serializeCookie('fixture', 'opaque');
    const cookie = jar.setCookieSync(header, loginUrl);
    expect(cookie.path).toBe('/');
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.hostOnly).toBe(true);
    expect(cookie.secure).toBe(false);
    expect(cookie.sameSite).toBeUndefined();
    expect(cookie.maxAge).toBeNull();
    expect(header).not.toMatch(/(?:^|;)\s*(?:Max-Age|SameSite|Domain)=/i);
    expect(jar.getCookieStringSync('https://vault.example/videos')).toBe('fixture=opaque');
    expect(jar.getCookieStringSync(loginUrl, { http: false })).toBe('');
    expect(jar.getCookieStringSync('https://sub.vault.example/videos')).toBe('');
  });

  test('produces a valid host-prefixed Secure HttpOnly Lax cookie that cannot travel over HTTP', () => {
    const jar = new CookieJar();
    const header = serializeCookie('__Host-fixture', 'opaque', {
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60,
    });
    const cookie = jar.setCookieSync(header, loginUrl);
    expect(cookie.key).toBe('__Host-fixture');
    expect(cookie.secure).toBe(true);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('lax');
    expect(cookie.maxAge).toBe(60);
    expect(cookie.path).toBe('/');
    expect(cookie.hostOnly).toBe(true);
    expect(header).not.toMatch(/(?:^|;)\s*Domain=/i);
    expect(jar.getCookieStringSync('https://vault.example/videos')).toBe('__Host-fixture=opaque');
    expect(jar.getCookieStringSync('http://vault.example/videos')).toBe('');
    expect(jar.getCookieStringSync(loginUrl, { http: false })).toBe('');
  });

  test.each(['Lax', 'Strict', 'None'] as const)(
    'preserves the explicitly requested SameSite=%s policy',
    (sameSite) => {
      const jar = new CookieJar();
      const cookie = jar.setCookieSync(
        serializeCookie('fixture', 'opaque', { sameSite, secure: true }),
        loginUrl,
      );
      expect(cookie.sameSite).toBe(sameSite.toLowerCase());
    },
  );

  test('honors explicit non-HttpOnly and non-Secure options for a client-readable preference cookie', () => {
    const jar = new CookieJar();
    const cookie = jar.setCookieSync(
      serializeCookie('preference', 'compact', { httpOnly: false, secure: false }),
      loginUrl,
    );
    expect(cookie.httpOnly).toBe(false);
    expect(cookie.secure).toBe(false);
    expect(jar.getCookieStringSync(loginUrl, { http: false })).toBe('preference=compact');
    expect(jar.getCookieStringSync('http://vault.example/account')).toBe('preference=compact');
  });

  test('respects an explicit path rather than widening a scoped cookie to the root', () => {
    const jar = new CookieJar();
    const cookie = jar.setCookieSync(
      serializeCookie('fixture', 'opaque', { path: '/account' }),
      loginUrl,
    );
    expect(cookie.path).toBe('/account');
    expect(jar.getCookieStringSync('https://vault.example/account/settings')).toBe(
      'fixture=opaque',
    );
    expect(jar.getCookieStringSync('https://vault.example/videos')).toBe('');
  });

  test('normalizes an empty path to the root for use across login and media routes', () => {
    const jar = new CookieJar();
    const cookie = jar.setCookieSync(serializeCookie('fixture', 'opaque', { path: '' }), loginUrl);
    expect(cookie.path).toBe('/');
    expect(jar.getCookieStringSync('https://vault.example/videos')).toBe('fixture=opaque');
  });

  test.each([
    { elapsed: 1999, expected: 'fixture=opaque' },
    { elapsed: 2000, expected: '' },
  ])(
    'uses seconds for Max-Age and handles the first request after $elapsed ms',
    ({ elapsed, expected }) => {
      vi.useFakeTimers();
      const now = new Date('2026-11-03T00:00:00Z');
      vi.setSystemTime(now);
      const jar = new CookieJar();
      jar.setCookieSync(serializeCookie('fixture', 'opaque', { maxAge: 2 }), loginUrl);
      vi.setSystemTime(new Date(now.getTime() + elapsed));
      expect(jar.getCookieStringSync(loginUrl)).toBe(expected);
    },
  );

  test('clears the same host/root cookie immediately with an empty value and Max-Age zero', () => {
    const jar = new CookieJar();
    const options = { secure: true, httpOnly: true, sameSite: 'Strict' as const, path: '/' };
    jar.setCookieSync(serializeCookie('__Host-fixture', 'opaque', options), loginUrl);
    expect(jar.getCookieStringSync(loginUrl)).toBe('__Host-fixture=opaque');
    const cleared = jar.setCookieSync(
      serializeCookie('__Host-fixture', '', { ...options, maxAge: 0 }),
      loginUrl,
    );
    expect(cleared.value).toBe('');
    expect(cleared.maxAge).toBe(0);
    expect(cleared.secure).toBe(true);
    expect(cleared.httpOnly).toBe(true);
    expect(cleared.sameSite).toBe('strict');
    expect(cleared.path).toBe('/');
    expect(cleared.hostOnly).toBe(true);
    expect(jar.getCookieStringSync(loginUrl)).toBe('');
  });
});
