import { expect, test } from '@playwright/test';
import { OWNER_PRIVATE_VIDEO_ID } from '../support/create-runtime-test-workspace';
import { loginToPath } from './support/auth';

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
    await expect(page.getByRole('button', { name: 'Edit Info' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
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
});
