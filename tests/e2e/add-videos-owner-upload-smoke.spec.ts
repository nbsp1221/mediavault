import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginToPath } from './support/auth';
const uploadFixturePath = path.resolve('tests/fixtures/upload/smoke-upload.mp4');

test.describe('add-videos owner upload smoke', () => {
  test('uploads a browser-selected video and commits it to the library', async ({ page }) => {
    const requests: string[] = [];
    const responses: Array<{ status: number; url: string }> = [];

    page.on('request', (request) => {
      requests.push(request.url());
    });
    page.on('response', (response) => {
      responses.push({
        status: response.status(),
        url: response.url(),
      });
    });

    await loginToPath(page, {
      expectedUrl: /\/add-videos$/,
      redirectTo: '/add-videos',
    });
    await page.locator('#choose-video-input').setInputFiles(uploadFixturePath);

    await expect(page.getByRole('heading', { level: 2, name: 'smoke-upload.mp4' })).toBeVisible();
    await expect(page.getByText('Ready to Add')).toBeVisible();

    await page.getByLabel('Title *').fill('Uploaded Smoke Fixture');
    await page.getByLabel('Tags').fill('Good Boy-comedy');
    await page.getByLabel('Tags').press('Enter');
    await expect(page.getByText('good boy-comedy')).toBeVisible();
    const commitResponsePromise = page.waitForResponse(response => (
      response.url().includes('/api/uploads/') &&
      response.url().endsWith('/commit') &&
      response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: 'Add to Library' }).click();
    const commitResponse = await commitResponsePromise;
    const commitJson = await commitResponse.json() as { videoId?: string };
    const videoId = commitJson.videoId;

    expect(videoId).toBeTruthy();

    await expect(
      page.getByText('"Uploaded Smoke Fixture" has been added to the library.'),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Upload Another Video' }).click();
    await expect(page.getByRole('button', { name: 'Choose Video' })).toBeVisible();

    await page.goto('/?q=good_boy-comedy&tag=good_boy-comedy');
    await expect(page.getByText('Has: good boy-comedy')).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Uploaded Smoke Fixture' }).first()).toBeVisible();

    await page.goto(`/player/${videoId}`);
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

    const protectedRequests = requests.filter(url => url.includes(`/videos/${videoId}/`));
    const unauthorizedProtectedResponses = responses.filter(response => (
      (response.status === 401 || response.status === 403) &&
      response.url.includes(`/videos/${videoId}/`)
    ));

    await expect(page.getByText('Playback error')).toHaveCount(0);
    expect(protectedRequests.some(url => url.includes(`/videos/${videoId}/token`))).toBe(true);
    expect(protectedRequests.some(url => url.includes(`/videos/${videoId}/clearkey`) && url.includes('token='))).toBe(true);
    expect(protectedRequests.some(url => url.includes(`/videos/${videoId}/manifest.mpd`) && url.includes('token='))).toBe(true);
    expect(protectedRequests.some(url => url.includes(`/videos/${videoId}/audio/`) && url.includes('token='))).toBe(true);
    expect(protectedRequests.some(url => url.includes(`/videos/${videoId}/video/`) && url.includes('token='))).toBe(true);
    expect(unauthorizedProtectedResponses).toEqual([]);
  });
});
