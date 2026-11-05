import { describe, expect, test } from 'vitest';
import { extractPlaybackToken } from '~/routes/.server/playback-route-utils';

const url = 'https://vault.example/videos/video-1/manifest.mpd';

describe('playback credential transport', () => {
  test.each(['Bearer signed-token', 'bearer signed-token'])(
    'accepts only Authorization bearer credentials (%s)',
    (authorization) => {
      expect(
        extractPlaybackToken(new Request(url, { headers: { Authorization: authorization } })),
      ).toBe('signed-token');
    },
  );
  test.each(['', 'Basic credentials', 'Bearer', 'Bearer token with spaces'])(
    'rejects missing or malformed bearer credentials (%s)',
    (authorization) => {
      expect(
        extractPlaybackToken(
          new Request(url, {
            headers: { Authorization: authorization, Cookie: 'session=not-a-playback-grant' },
          }),
        ),
      ).toBeNull();
    },
  );
  test.each(['token', 'access_token'])(
    'rejects URL credentials (%s), including empty parameters and simultaneous headers',
    (name) => {
      for (const value of ['', 'signed-token']) {
        for (const authorization of ['', 'Bearer signed-token']) {
          const headers = new Headers();
          if (authorization) {
            headers.set('Authorization', authorization);
          }
          expect(() =>
            extractPlaybackToken(new Request(`${url}?${name}=${value}`, { headers })),
          ).toThrow(Response);
        }
      }
    },
  );
});
