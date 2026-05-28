import { type APIResponse, expect, test } from '@playwright/test';
import {
  E2E_AUTH_PASSWORD,
  E2E_AUTH_USERNAME,
} from '../support/auth-account';
import {
  OTHER_PRIVATE_VIDEO_ID,
  OTHER_PUBLIC_VIDEO_ID,
  OWNER_PRIVATE_VIDEO_ID,
  OWNER_PUBLIC_VIDEO_ID,
} from '../support/create-runtime-test-workspace';

const MISSING_VIDEO_ID = '00000000-0000-4000-8000-000000000000';

function expectNoPermissiveCors(headers: Record<string, string>) {
  expect(headers['access-control-allow-origin']).toBeUndefined();
  expect(headers['access-control-allow-headers']).toBeUndefined();
  expect(headers['access-control-allow-methods']).toBeUndefined();
}

test.describe('anonymous public access', () => {
  test('serves the home catalog with only public videos and no owner controls', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My Library' })).toBeVisible();
    await expect(page.getByRole('heading', { exact: true, level: 3, name: 'playtime' })).toBeVisible();
    await expect(page.getByRole('heading', { exact: true, level: 3, name: 'playtime2' })).toBeVisible();
    await expect(page.getByText('owner-private-playtime')).toHaveCount(0);
    await expect(page.getByText('other-private-playtime')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Upload/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Account Menu' })).toHaveCount(0);
  });

  test('hides private direct URLs while issuing public playback tokens without a session', async ({ request }) => {
    const publicTokenResponse = await request.get(`/videos/${OWNER_PUBLIC_VIDEO_ID}/token`);
    expect(publicTokenResponse.status()).toBe(200);
    expect(publicTokenResponse.headers()['cache-control']).toBe('no-store');
    expectNoPermissiveCors(publicTokenResponse.headers());
    const publicTokenBody = await publicTokenResponse.json();
    const publicToken = publicTokenBody.token;
    expect(publicTokenBody).toMatchObject({
      success: true,
      token: expect.any(String),
      urls: {
        manifest: `/videos/${OWNER_PUBLIC_VIDEO_ID}/manifest.mpd`,
      },
    });
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

    const publicSegmentResponse = await request.get(`/videos/${OWNER_PUBLIC_VIDEO_ID}/video/init.mp4`, {
      headers: {
        Authorization: `Bearer ${publicToken}`,
      },
    });
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

    const ambiguousTokenResponse = await request.get(`/videos/${OWNER_PUBLIC_VIDEO_ID}/manifest.mpd?token=${publicToken}`, {
      headers: {
        Authorization: `Bearer ${publicToken}`,
      },
    });
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

  test('normalizes missing and inaccessible private direct-read responses', async ({ request }) => {
    const publicTokenBody = await (await request.get(`/videos/${OWNER_PUBLIC_VIDEO_ID}/token`)).json();
    const publicToken = publicTokenBody.token;

    const snapshot = async (videoId: string) => ({
      clearKeyGet: await routeResponseSnapshot(await request.get(`/videos/${videoId}/clearkey`, {
        headers: { Authorization: `Bearer ${publicToken}` },
      })),
      clearKeyPost: await routeResponseSnapshot(await request.post(`/videos/${videoId}/clearkey`, {
        headers: { Authorization: `Bearer ${publicToken}` },
      })),
      manifest: await routeResponseSnapshot(await request.get(`/videos/${videoId}/manifest.mpd`, {
        headers: { Authorization: `Bearer ${publicToken}` },
      })),
      manifestHead: await routeResponseSnapshot(await request.head(`/videos/${videoId}/manifest.mpd`, {
        headers: { Authorization: `Bearer ${publicToken}` },
      })),
      player: await routeResponseSnapshot(await request.get(`/player/${videoId}`)),
      segment: await routeResponseSnapshot(await request.get(`/videos/${videoId}/video/init.mp4`, {
        headers: { Authorization: `Bearer ${publicToken}` },
      })),
      segmentHead: await routeResponseSnapshot(await request.head(`/videos/${videoId}/video/init.mp4`, {
        headers: { Authorization: `Bearer ${publicToken}` },
      })),
      segmentRange: await routeResponseSnapshot(await request.get(`/videos/${videoId}/video/init.mp4`, {
        headers: {
          Authorization: `Bearer ${publicToken}`,
          Range: 'bytes=0-8',
        },
      })),
      thumbnail: await routeResponseSnapshot(await request.get(`/api/thumbnail/${videoId}`)),
      token: await routeResponseSnapshot(await request.get(`/videos/${videoId}/token`)),
    });

    await expect(snapshot(OWNER_PRIVATE_VIDEO_ID)).resolves.toEqual(await snapshot(MISSING_VIDEO_ID));
    await expect(snapshot(OTHER_PRIVATE_VIDEO_ID)).resolves.toEqual(await snapshot(MISSING_VIDEO_ID));

    const loginResponse = await request.post('/api/auth/login', {
      data: {
        password: E2E_AUTH_PASSWORD,
        username: E2E_AUTH_USERNAME,
      },
    });
    expect(loginResponse.status()).toBe(200);

    const ownerTokenBody = await (await request.get(`/videos/${OWNER_PRIVATE_VIDEO_ID}/token`)).json();
    const ownerPrivateToken = ownerTokenBody.token;

    const authenticatedNonOwnerSnapshot = async (videoId: string) => ({
      clearKeyGet: await routeResponseSnapshot(await request.get(`/videos/${videoId}/clearkey`, {
        headers: { Authorization: `Bearer ${ownerPrivateToken}` },
      })),
      clearKeyPost: await routeResponseSnapshot(await request.post(`/videos/${videoId}/clearkey`, {
        headers: { Authorization: `Bearer ${ownerPrivateToken}` },
      })),
      manifest: await routeResponseSnapshot(await request.get(`/videos/${videoId}/manifest.mpd`, {
        headers: { Authorization: `Bearer ${ownerPrivateToken}` },
      })),
      manifestHead: await routeResponseSnapshot(await request.head(`/videos/${videoId}/manifest.mpd`, {
        headers: { Authorization: `Bearer ${ownerPrivateToken}` },
      })),
      player: await routeResponseSnapshot(await request.get(`/player/${videoId}`)),
      segment: await routeResponseSnapshot(await request.get(`/videos/${videoId}/video/init.mp4`, {
        headers: { Authorization: `Bearer ${ownerPrivateToken}` },
      })),
      segmentHead: await routeResponseSnapshot(await request.head(`/videos/${videoId}/video/init.mp4`, {
        headers: { Authorization: `Bearer ${ownerPrivateToken}` },
      })),
      segmentRange: await routeResponseSnapshot(await request.get(`/videos/${videoId}/video/init.mp4`, {
        headers: {
          Authorization: `Bearer ${ownerPrivateToken}`,
          Range: 'bytes=0-8',
        },
      })),
      thumbnail: await routeResponseSnapshot(await request.get(`/api/thumbnail/${videoId}`)),
      token: await routeResponseSnapshot(await request.get(`/videos/${videoId}/token`)),
    });

    await expect(authenticatedNonOwnerSnapshot(OTHER_PRIVATE_VIDEO_ID))
      .resolves.toEqual(await authenticatedNonOwnerSnapshot(MISSING_VIDEO_ID));
  });
});

async function routeResponseSnapshot(response: APIResponse) {
  return {
    body: await response.text(),
    cacheControl: response.headers()['cache-control'],
    contentRange: response.headers()['content-range'],
    contentType: response.headers()['content-type'],
    status: response.status(),
  };
}
