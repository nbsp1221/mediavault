import { describe, expect, test } from 'vitest';
import { rejectCrossOriginMutation } from '~/shared/lib/http/csrf.server';

const url = 'https://vault.example/api/update/video-1';

describe('cookie command CSRF defense', () => {
  test.each(['POST', 'PUT', 'PATCH', 'DELETE'])('permits a same-origin %s command', (method) => {
    expect(
      rejectCrossOriginMutation(
        new Request(url, {
          headers: { 'Origin': 'https://vault.example', 'Sec-Fetch-Site': 'same-origin' },
          method,
        }),
      ),
    ).toBeNull();
  });

  test.each([
    {},
    { Origin: 'null' },
    { Origin: 'https://evil.example' },
    { Origin: 'https://vault.example.evil.example' },
    { Origin: 'http://vault.example' },
    { Origin: 'https://vault.example:444' },
    { 'Origin': 'https://vault.example', 'Sec-Fetch-Site': 'cross-site' },
    { 'Origin': 'https://vault.example', 'Sec-Fetch-Site': 'same-site' },
    { Referer: 'https://evil.example/form' },
    { Referer: 'malformed' },
    { 'Sec-Fetch-Site': 'none' },
    { 'Origin': 'null', 'Sec-Fetch-Site': 'same-origin' },
  ])('rejects missing or untrusted source evidence %#', (headers) => {
    const response = rejectCrossOriginMutation(
      new Request(url, {
        headers: Object.fromEntries(
          Object.entries(headers).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        ),
        method: 'POST',
      }),
    );
    expect(response?.status).toBe(403);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
  });

  test('uses a same-origin Referer only when Origin is absent', () => {
    expect(
      rejectCrossOriginMutation(
        new Request(url, { headers: { Referer: 'https://vault.example/edit' }, method: 'DELETE' }),
      ),
    ).toBeNull();
    expect(
      rejectCrossOriginMutation(
        new Request(url, {
          headers: { Origin: 'null', Referer: 'https://vault.example/edit' },
          method: 'DELETE',
        }),
      )?.status,
    ).toBe(403);
  });

  test('accepts browser-controlled same-origin Fetch Metadata when source headers are omitted', () => {
    expect(
      rejectCrossOriginMutation(
        new Request(url, { headers: { 'Sec-Fetch-Site': 'same-origin' }, method: 'POST' }),
      ),
    ).toBeNull();
  });

  test.each(['GET', 'HEAD', 'OPTIONS'])(
    'does not treat safe %s requests as mutations',
    (method) => {
      expect(
        rejectCrossOriginMutation(
          new Request(url, { headers: { Origin: 'https://evil.example' }, method }),
        ),
      ).toBeNull();
    },
  );
});
