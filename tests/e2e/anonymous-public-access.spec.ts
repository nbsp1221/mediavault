import { type APIResponse, type Page, expect, test } from '@playwright/test';
import { E2E_AUTH_PASSWORD, E2E_AUTH_USERNAME } from '../support/auth-account';
import {
  OTHER_PRIVATE_VIDEO_ID,
  OTHER_PUBLIC_VIDEO_ID,
  OWNER_PRIVATE_VIDEO_ID,
  OWNER_PUBLIC_VIDEO_ID,
} from '../support/create-runtime-test-workspace';
import { playbackTokenSchema } from './support/playback';

const MISSING_VIDEO_ID = '00000000-0000-4000-8000-000000000000';

function expectNoPermissiveCors(headers: Record<string, string>) {
  expect(headers['access-control-allow-origin']).toBeUndefined();
  expect(headers['access-control-allow-headers']).toBeUndefined();
  expect(headers['access-control-allow-methods']).toBeUndefined();
}

test.describe('anonymous public access', () => {
  test('serves the home catalog with only public videos and no owner controls', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Videos' })).toBeVisible();
    await expect(
      page.getByRole('heading', { exact: true, level: 3, name: 'playtime' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { exact: true, level: 3, name: 'playtime2' }),
    ).toBeVisible();
    await expect(page.getByText('owner-private-playtime')).toHaveCount(0);
    await expect(page.getByText('other-private-playtime')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Upload/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Playlists', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Favorites, Soon' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'History, Soon' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Settings, Soon' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0);
  });

  test('hides private direct URLs while issuing public playback tokens without a session', async ({
    request,
  }) => {
    const publicTokenResponse = await request.get(`/videos/${OWNER_PUBLIC_VIDEO_ID}/token`);
    expect(publicTokenResponse.status()).toBe(200);
    expect(publicTokenResponse.headers()['cache-control']).toBe('no-store');
    expectNoPermissiveCors(publicTokenResponse.headers());
    const publicTokenBody = playbackTokenSchema.parse(await publicTokenResponse.json());
    const publicToken = publicTokenBody.token;
    expect(publicTokenBody.urls.manifest).toBe(`/videos/${OWNER_PUBLIC_VIDEO_ID}/manifest.mpd`);
    expect(publicTokenBody.urls.manifest).not.toContain('token=');
    expect(publicTokenBody.urls.clearkey).not.toContain('token=');

    const publicManifestResponse = await request.get(publicTokenBody.urls.manifest, {
      headers: {
        Authorization: `Bearer ${publicToken}`,
      },
    });
    expect(publicManifestResponse.status()).toBe(200);
    expect(publicManifestResponse.headers()['cache-control']).toBe('no-store');
    expect(publicManifestResponse.headers()['referrer-policy']).toBe('no-referrer');
    expect(publicManifestResponse.headers()['x-content-type-options']).toBe('nosniff');
    expectNoPermissiveCors(publicManifestResponse.headers());

    const publicSegmentResponse = await request.get(
      `/videos/${OWNER_PUBLIC_VIDEO_ID}/video/init.mp4`,
      {
        headers: {
          Authorization: `Bearer ${publicToken}`,
        },
      },
    );
    expect(publicSegmentResponse.status()).toBe(200);
    expect(publicSegmentResponse.headers()['cache-control']).toBe('no-store');
    expect(publicSegmentResponse.headers()['referrer-policy']).toBe('no-referrer');
    expect(publicSegmentResponse.headers()['x-content-type-options']).toBe('nosniff');
    expectNoPermissiveCors(publicSegmentResponse.headers());

    const publicThumbnailResponse = await request.get(`/api/thumbnail/${OWNER_PUBLIC_VIDEO_ID}`);
    expect(publicThumbnailResponse.status()).toBe(200);
    expect(publicThumbnailResponse.headers()['cache-control']).toBe('private, no-store');
    expectNoPermissiveCors(publicThumbnailResponse.headers());

    const publicLicenseResponse = await request.post(publicTokenBody.urls.clearkey, {
      headers: {
        Authorization: `Bearer ${publicToken}`,
      },
    });
    expect(publicLicenseResponse.status()).toBe(200);
    expect(publicLicenseResponse.headers()['cache-control']).toContain('no-store');
    expectNoPermissiveCors(publicLicenseResponse.headers());

    const ambiguousTokenResponse = await request.get(
      `/videos/${OWNER_PUBLIC_VIDEO_ID}/manifest.mpd?token=legacy-query-is-forbidden`,
      {
        headers: {
          Authorization: `Bearer ${publicToken}`,
        },
      },
    );
    expect(ambiguousTokenResponse.status()).toBe(400);
    expect(ambiguousTokenResponse.headers()['cache-control']).toBe('no-store');

    const otherPublicTokenResponse = await request.get(`/videos/${OTHER_PUBLIC_VIDEO_ID}/token`);
    expect(otherPublicTokenResponse.status()).toBe(200);

    for (const videoId of [OWNER_PRIVATE_VIDEO_ID, OTHER_PRIVATE_VIDEO_ID]) {
      const tokenResponse = await request.get(`/videos/${videoId}/token`);
      expect(tokenResponse.status()).toBe(404);
      expect(tokenResponse.headers()['cache-control']).toBe('no-store');
      expect(await tokenResponse.json()).toEqual({
        error: 'Video not found',
        success: false,
      });

      const playerResponse = await request.get(`/player/${videoId}`);
      expect(playerResponse.status()).toBe(404);

      const thumbnailResponse = await request.get(`/api/thumbnail/${videoId}`);
      expect(thumbnailResponse.status()).toBe(404);
      expect(thumbnailResponse.headers()['cache-control']).toBe('private, no-store');

      const manifestResponse = await request.get(`/videos/${videoId}/manifest.mpd`, {
        headers: {
          Authorization: `Bearer ${publicToken}`,
        },
      });
      expect(manifestResponse.status()).toBe(404);
      expect(manifestResponse.headers()['cache-control']).toBe('no-store');
      expect(await manifestResponse.text()).toBe('Video not found');

      const segmentResponse = await request.get(`/videos/${videoId}/video/init.mp4`, {
        headers: {
          Authorization: `Bearer ${publicToken}`,
        },
      });
      expect(segmentResponse.status()).toBe(404);
      expect(segmentResponse.headers()['cache-control']).toBe('no-store');
      expect(await segmentResponse.text()).toBe('Video not found');

      const licenseResponse = await request.post(`/videos/${videoId}/clearkey`, {
        headers: {
          Authorization: `Bearer ${publicToken}`,
        },
      });
      expect(licenseResponse.status()).toBe(404);
      expect(licenseResponse.headers()['cache-control']).toBe('no-store');
      expectNoPermissiveCors(licenseResponse.headers());
      expect(await licenseResponse.text()).toBe('Video not found');
    }
  });

  test('normalizes missing and inaccessible private direct-read responses', async ({ page }) => {
    const request = page.request;
    const publicTokenResponse = await request.get(`/videos/${OWNER_PUBLIC_VIDEO_ID}/token`);
    const publicTokenBody = playbackTokenSchema.parse(await publicTokenResponse.json());
    const publicToken = publicTokenBody.token;

    const snapshot = async (videoId: string) => ({
      clearKeyGet: await routeResponseSnapshot(
        await request.get(`/videos/${videoId}/clearkey`, {
          headers: { Authorization: `Bearer ${publicToken}` },
        }),
      ),
      clearKeyPost: await routeResponseSnapshot(
        await request.post(`/videos/${videoId}/clearkey`, {
          headers: { Authorization: `Bearer ${publicToken}` },
        }),
      ),
      manifest: await routeResponseSnapshot(
        await request.get(`/videos/${videoId}/manifest.mpd`, {
          headers: { Authorization: `Bearer ${publicToken}` },
        }),
      ),
      manifestHead: await routeResponseSnapshot(
        await request.head(`/videos/${videoId}/manifest.mpd`, {
          headers: { Authorization: `Bearer ${publicToken}` },
        }),
      ),
      player: await playerResponseSnapshot(
        await request.get(`/player/${videoId}`),
        page,
        videoId,
        true,
      ),
      segment: await routeResponseSnapshot(
        await request.get(`/videos/${videoId}/video/init.mp4`, {
          headers: { Authorization: `Bearer ${publicToken}` },
        }),
      ),
      segmentHead: await routeResponseSnapshot(
        await request.head(`/videos/${videoId}/video/init.mp4`, {
          headers: { Authorization: `Bearer ${publicToken}` },
        }),
      ),
      segmentRange: await routeResponseSnapshot(
        await request.get(`/videos/${videoId}/video/init.mp4`, {
          headers: {
            Authorization: `Bearer ${publicToken}`,
            Range: 'bytes=0-8',
          },
        }),
      ),
      thumbnail: await routeResponseSnapshot(await request.get(`/api/thumbnail/${videoId}`)),
      token: await routeResponseSnapshot(await request.get(`/videos/${videoId}/token`)),
    });

    expect(await snapshot(OWNER_PRIVATE_VIDEO_ID)).toEqual(await snapshot(MISSING_VIDEO_ID));
    expect(await snapshot(OTHER_PRIVATE_VIDEO_ID)).toEqual(await snapshot(MISSING_VIDEO_ID));

    const loginResponse = await request.post('/api/auth/login', {
      headers: { Origin: new URL(publicTokenResponse.url()).origin },
      data: {
        password: E2E_AUTH_PASSWORD,
        username: E2E_AUTH_USERNAME,
      },
    });
    expect(loginResponse.status()).toBe(200);

    const ownerPlayer = await request.get(`/player/${OWNER_PRIVATE_VIDEO_ID}`);
    expect(ownerPlayer.status()).toBe(200);
    expect(ownerPlayer.headers()['cache-control']).toBe('private, no-store');
    expect(ownerPlayer.headers().vary).toBe('Cookie');
    expect(ownerPlayer.headers()['referrer-policy']).toBe('no-referrer');

    const ownerTokenBody = playbackTokenSchema.parse(
      await (await request.get(`/videos/${OWNER_PRIVATE_VIDEO_ID}/token`)).json(),
    );
    const ownerPrivateToken = ownerTokenBody.token;

    const authenticatedNonOwnerSnapshot = async (videoId: string) => ({
      clearKeyGet: await routeResponseSnapshot(
        await request.get(`/videos/${videoId}/clearkey`, {
          headers: { Authorization: `Bearer ${ownerPrivateToken}` },
        }),
      ),
      clearKeyPost: await routeResponseSnapshot(
        await request.post(`/videos/${videoId}/clearkey`, {
          headers: { Authorization: `Bearer ${ownerPrivateToken}` },
        }),
      ),
      manifest: await routeResponseSnapshot(
        await request.get(`/videos/${videoId}/manifest.mpd`, {
          headers: { Authorization: `Bearer ${ownerPrivateToken}` },
        }),
      ),
      manifestHead: await routeResponseSnapshot(
        await request.head(`/videos/${videoId}/manifest.mpd`, {
          headers: { Authorization: `Bearer ${ownerPrivateToken}` },
        }),
      ),
      player: await playerResponseSnapshot(
        await request.get(`/player/${videoId}`),
        page,
        videoId,
        false,
      ),
      segment: await routeResponseSnapshot(
        await request.get(`/videos/${videoId}/video/init.mp4`, {
          headers: { Authorization: `Bearer ${ownerPrivateToken}` },
        }),
      ),
      segmentHead: await routeResponseSnapshot(
        await request.head(`/videos/${videoId}/video/init.mp4`, {
          headers: { Authorization: `Bearer ${ownerPrivateToken}` },
        }),
      ),
      segmentRange: await routeResponseSnapshot(
        await request.get(`/videos/${videoId}/video/init.mp4`, {
          headers: {
            Authorization: `Bearer ${ownerPrivateToken}`,
            Range: 'bytes=0-8',
          },
        }),
      ),
      thumbnail: await routeResponseSnapshot(await request.get(`/api/thumbnail/${videoId}`)),
      token: await routeResponseSnapshot(await request.get(`/videos/${videoId}/token`)),
    });

    expect(await authenticatedNonOwnerSnapshot(OTHER_PRIVATE_VIDEO_ID)).toEqual(
      await authenticatedNonOwnerSnapshot(MISSING_VIDEO_ID),
    );
  });
});

async function routeResponseSnapshot(response: APIResponse) {
  const headers = response.headers();
  expect(response.status()).toBe(404);
  expect(headers['cache-control']).toContain('no-store');
  expect(headers['content-range']).toBeUndefined();
  expect(headers['accept-ranges']).toBeUndefined();
  expectNoPermissiveCors(headers);
  const body = await response.text();
  // Fail without dumping a potentially sensitive payload into assertion output.
  expect(
    /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(body),
    'Denial body must not contain a JWT',
  ).toBe(false);
  expect(/"keys"\s*:/.test(body), 'Denial body must not contain a ClearKey license').toBe(false);
  return {
    body,
    cacheControl: headers['cache-control'],
    contentRange: headers['content-range'],
    contentType: headers['content-type'],
    referrerPolicy: headers['referrer-policy'],
    vary: headers.vary,
    status: response.status(),
  };
}

function expectNoPrivatePlayerPayload(html: string) {
  const privateCanaries = [
    'owner-private-playtime',
    'other-private-playtime',
    'Owner private playback fixture',
    'Non-owner private playback fixture',
    'other-user',
    ...[OWNER_PRIVATE_VIDEO_ID, OTHER_PRIVATE_VIDEO_ID].flatMap((id) => [
      `/api/thumbnail/${id}`,
      `/videos/${id}/manifest.mpd`,
      `/videos/${id}/token`,
      `/videos/${id}/clearkey`,
    ]),
  ];
  for (const canary of privateCanaries) {
    expect(
      html.includes(canary),
      'Private video metadata must not appear in the denied document',
    ).toBe(false);
  }
  expect(
    /\\*"(?:video|relatedVideos|videoUrl|thumbnailUrl|ownerId|videoIds)\\*"/.test(html),
    'Denied player must not serialize video metadata',
  ).toBe(false);
  expect(
    /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(html),
    'Denied player must not serialize a token',
  ).toBe(false);
}

async function playerResponseSnapshot(
  response: APIResponse,
  page: Page,
  videoId: string,
  anonymous: boolean,
) {
  const snapshot = await routeResponseSnapshot(response);
  expect(snapshot.cacheControl).toBe('private, no-store');
  expect(snapshot.contentType).toContain('text/html');
  expect(snapshot.referrerPolicy).toBe('no-referrer');
  expect(snapshot.vary).toBe('Cookie');
  expectNoPrivatePlayerPayload(snapshot.body);
  const path = `/player/${videoId}`;
  expect(new URL(response.url()).pathname).toBe(path);
  const navigation = await page.goto(path);
  if (!navigation) {
    throw new Error('Expected a player document response');
  }
  expect(navigation.status()).toBe(404);
  const documentHeaders = await navigation.allHeaders();
  expect(documentHeaders['cache-control']).toBe('private, no-store');
  expect(documentHeaders.vary).toBe('Cookie');
  expect(documentHeaders['referrer-policy']).toBe('no-referrer');
  expect(documentHeaders['content-range']).toBeUndefined();
  expect(documentHeaders['accept-ranges']).toBeUndefined();
  expectNoPermissiveCors(documentHeaders);
  await expect(page).toHaveTitle('Video Player - Mediavault');
  await expect(
    page.getByRole('heading', { level: 1, name: 'We can’t find that video', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'We can’t find that video', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('The video might have been removed or the link could be incorrect.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to library', exact: true })).toHaveAttribute(
    'href',
    '/',
  );
  await expect(page.getByTestId('player-viewport')).toHaveCount(0);
  await expect(page.locator('video')).toHaveCount(0);
  expectNoPrivatePlayerPayload(await page.content());
  const signIn = page.getByRole('link', { name: 'Sign in', exact: true });
  if (!anonymous) {
    await expect(signIn).toHaveCount(0);
    return snapshot;
  }
  const href = `/login?${new URLSearchParams({ redirectTo: path })}`;
  await expect(signIn).toHaveAttribute('href', href);
  const attribute = `href="${href}"`;
  expect(snapshot.body.split(attribute)).toHaveLength(2);
  // Only the verified input-derived Sign in href differs; every other HTML byte stays compared.
  return {
    ...snapshot,
    body: snapshot.body.replace(attribute, 'href="[requested-player-sign-in]"'),
  };
}
