import { expect, test } from '@playwright/test';
import { OTHER_PUBLIC_VIDEO_ID, OWNER_PRIVATE_VIDEO_ID } from '../support/create-runtime-test-workspace';
import { loginToPath } from './support/auth';

function deriveFirstVideoSegmentPath(manifestXml: string): string {
  const templateMatch = manifestXml.match(/contentType="video"[\s\S]*?<SegmentTemplate[^>]*media="([^"]+)"[^>]*startNumber="(\d+)"/);
  expect(templateMatch, 'Expected video SegmentTemplate in DASH manifest').not.toBeNull();
  const [, mediaTemplate, startNumber] = templateMatch as RegExpMatchArray;

  return mediaTemplate.replace('$Number%04d$', startNumber.padStart(4, '0'));
}

test.describe('home library owner smoke', () => {
  test('boots the authenticated home route with loader bootstrap filters', async ({ page }) => {
    await loginToPath(page, {
      expectedUrl: /\/\?q=action&tag=action&type=clip&genre=action$/,
      redirectTo: '/?q=action&tag=action&type=clip&genre=action',
    });
    await expect(page.getByRole('heading', { level: 1, name: 'My Library' })).toBeVisible();
    await expect(page.getByLabel('Search library (desktop)')).toHaveValue('action');
    await expect(page.getByText('Active filters:')).toBeVisible();
    await expect(page.getByText('Has: action')).toBeVisible();
    await expect(page.getByText('Type: Clip')).toBeVisible();
    await expect(page.getByText('Genre: Action')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Playlists' })).toBeVisible();
  });

  test('shows public non-owner videos as watchable read-only items', async ({ page }) => {
    await loginToPath(page, {
      expectedUrl: /\/$/,
      redirectTo: '/',
    });

    const publicNonOwnerCard = page.getByRole('link', { name: /playtime2/ }).locator('xpath=..');

    await expect(publicNonOwnerCard).toBeVisible();
    await expect(publicNonOwnerCard.getByLabel('Private video')).toHaveCount(0);

    await publicNonOwnerCard.getByRole('button', { name: 'Open actions menu' }).click({ force: true });
    await page.getByRole('menuitem', { name: 'Quick view' }).click();

    await expect(page.getByRole('heading', { name: 'playtime2' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Watch' })).toHaveAttribute(
      'href',
      '/player/754c6828-621c-4df6-9cf8-a3d77297b85a',
    );
    await expect(page.getByRole('button', { name: 'Make Private' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Make Public' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit Info' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);

    const directMutationStatus = await page.evaluate(async (videoId) => {
      const response = await fetch(`/api/visibility/${videoId}`, {
        body: JSON.stringify({ visibility: 'private' }),
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });

      return response.status;
    }, OTHER_PUBLIC_VIDEO_ID);

    expect(directMutationStatus).toBe(403);
  });

  test('keeps owner private videos visible and manageable for the owner', async ({ page }) => {
    const protectedRequests: Array<{ headers: Record<string, string>; url: string }> = [];

    page.on('request', (request) => {
      if (request.url().includes(`/videos/${OWNER_PRIVATE_VIDEO_ID}/`)) {
        protectedRequests.push({
          headers: request.headers(),
          url: request.url(),
        });
      }
    });

    await loginToPath(page, {
      expectedUrl: /\/$/,
      redirectTo: '/',
    });

    const ownerPrivateCard = page.getByRole('link', { name: /owner-private-playtime/ }).locator('xpath=..');

    await expect(ownerPrivateCard).toBeVisible();
    await expect(ownerPrivateCard.getByLabel('Private video')).toBeVisible();

    await ownerPrivateCard.getByRole('button', { name: 'Open actions menu' }).click({ force: true });
    await page.getByRole('menuitem', { name: 'Quick view' }).click();

    await expect(page.getByRole('heading', { name: 'owner-private-playtime' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Watch' })).toHaveAttribute(
      'href',
      `/player/${OWNER_PRIVATE_VIDEO_ID}`,
    );
    await expect(page.getByRole('button', { name: 'Edit Info' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();

    await page.goto(`/player/${OWNER_PRIVATE_VIDEO_ID}`);
    await expect(page).toHaveURL(new RegExp(`/player/${OWNER_PRIVATE_VIDEO_ID}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'owner-private-playtime' })).toBeVisible();

    await page.waitForSelector('[data-media-player][data-can-play]');
    const player = page.locator('[data-media-player] video');

    await player.evaluate(async (video: HTMLVideoElement) => {
      await video.play();
    });
    await expect.poll(async () => player.evaluate((video: HTMLVideoElement) => ({
      currentTime: video.currentTime,
      paused: video.paused,
    })), {
      timeout: 10_000,
    }).toMatchObject({
      paused: false,
    });
    await expect.poll(async () => player.evaluate((video: HTMLVideoElement) => video.currentTime), {
      timeout: 10_000,
    }).toBeGreaterThan(0);

    expect(protectedRequests.some(request => request.url.includes(`/videos/${OWNER_PRIVATE_VIDEO_ID}/clearkey`))).toBe(true);
    expect(protectedRequests.some(request => request.url.includes(`/videos/${OWNER_PRIVATE_VIDEO_ID}/manifest.mpd`))).toBe(true);
    expect(protectedRequests.some(request => request.url.includes(`/videos/${OWNER_PRIVATE_VIDEO_ID}/audio/`))).toBe(true);
    expect(protectedRequests.some(request => request.url.includes(`/videos/${OWNER_PRIVATE_VIDEO_ID}/video/`))).toBe(true);
    expect(protectedRequests.every(request => !request.url.includes('token='))).toBe(true);
    expect(protectedRequests.some(request => request.headers.authorization?.startsWith('Bearer '))).toBe(true);
  });

  test('publishes and privatizes an owner video through Quick View with immediate public access changes', async ({ browser, page, request }) => {
    await loginToPath(page, {
      expectedUrl: /\/$/,
      redirectTo: '/',
    });

    const ownerPrivateCard = page.getByRole('link', { name: /owner-private-playtime/ }).locator('xpath=..');
    await expect(ownerPrivateCard).toBeVisible();
    await expect(ownerPrivateCard.getByLabel('Private video')).toBeVisible();

    await ownerPrivateCard.getByRole('button', { name: 'Open actions menu' }).click({ force: true });
    await page.getByRole('menuitem', { name: 'Quick view' }).click();

    await expect(page.getByText('Visibility: Private')).toBeVisible();
    await page.getByRole('button', { name: 'Make Public' }).click();
    await expect(page.getByRole('dialog', { name: 'Make video public?' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Make video public?' }).getByRole('button', { name: 'Make Public' }).click();
    await expect(page.getByRole('status')).toHaveText('Visibility updated to Public.');
    await expect(page.getByText('Visibility: Public')).toBeVisible();

    const anonymousTokenResponse = await request.get(`/videos/${OWNER_PRIVATE_VIDEO_ID}/token`);
    expect(anonymousTokenResponse.status()).toBe(200);
    const anonymousTokenBody = await anonymousTokenResponse.json();
    const publicToken = anonymousTokenBody.token as string;
    const publicManifestUrl = anonymousTokenBody.urls.manifest as string;
    const publicClearKeyUrl = anonymousTokenBody.urls.clearkey as string;

    const publicManifestResponse = await request.get(publicManifestUrl, {
      headers: {
        Authorization: `Bearer ${publicToken}`,
      },
    });
    expect(publicManifestResponse.status()).toBe(200);
    const publicManifestXml = await publicManifestResponse.text();
    const publicVideoSegmentPath = deriveFirstVideoSegmentPath(publicManifestXml);

    expect((await request.get(`/videos/${OWNER_PRIVATE_VIDEO_ID}/${publicVideoSegmentPath}`, {
      headers: {
        Authorization: `Bearer ${publicToken}`,
      },
    })).status()).toBe(200);
    expect((await request.post(publicClearKeyUrl, {
      headers: {
        Authorization: `Bearer ${publicToken}`,
      },
    })).status()).toBe(200);

    const anonymousContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
    });
    const anonymousPage = await anonymousContext.newPage();
    await anonymousPage.goto('/');
    await expect(anonymousPage.getByRole('link', { name: /owner-private-playtime/ })).toBeVisible();
    const anonymousCard = anonymousPage.getByRole('link', { name: /owner-private-playtime/ }).locator('xpath=..');
    await anonymousCard.getByRole('button', { name: 'Open actions menu' }).click({ force: true });
    await anonymousPage.getByRole('menuitem', { name: 'Quick view' }).click();
    await expect(anonymousPage.getByRole('heading', { name: 'owner-private-playtime' })).toBeVisible();
    await expect(anonymousPage.getByRole('button', { name: 'Make Private' })).toHaveCount(0);
    await expect(anonymousPage.getByRole('button', { name: 'Edit Info' })).toHaveCount(0);
    await anonymousPage.goto(`/player/${OWNER_PRIVATE_VIDEO_ID}`);
    await expect(anonymousPage.getByRole('heading', { level: 1, name: 'owner-private-playtime' })).toBeVisible();

    await page.getByRole('button', { name: 'Make Private' }).click();
    await expect(page.getByRole('status')).toHaveText('Visibility updated to Private.');
    await expect(page.getByText('Visibility: Private')).toBeVisible();

    await anonymousPage.goto('/');
    await expect(anonymousPage.getByRole('link', { name: /owner-private-playtime/ })).toHaveCount(0);
    await anonymousContext.close();

    const tokenAfterPrivatize = await request.get(`/videos/${OWNER_PRIVATE_VIDEO_ID}/token`);
    expect(tokenAfterPrivatize.status()).toBe(404);
    expect(tokenAfterPrivatize.headers()['cache-control']).toBe('no-store');
    expect((await request.get(`/player/${OWNER_PRIVATE_VIDEO_ID}`)).status()).toBe(404);
    expect((await request.get(`/api/thumbnail/${OWNER_PRIVATE_VIDEO_ID}`)).status()).toBe(404);
    expect((await request.get(publicManifestUrl, {
      headers: {
        Authorization: `Bearer ${publicToken}`,
      },
    })).status()).toBe(404);
    expect((await request.get(`/videos/${OWNER_PRIVATE_VIDEO_ID}/${publicVideoSegmentPath}`, {
      headers: {
        Authorization: `Bearer ${publicToken}`,
      },
    })).status()).toBe(404);
    expect((await request.post(publicClearKeyUrl, {
      headers: {
        Authorization: `Bearer ${publicToken}`,
      },
    })).status()).toBe(404);
  });
});
