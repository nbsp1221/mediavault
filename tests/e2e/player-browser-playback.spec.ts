import { expect, test } from '@playwright/test';
import { loginToPlayer } from './support/player-auth';

const playbackFixtureVideoId = '68e5f819-15e8-41ef-90ee-8a96769311b7';
test.describe('player browser playback', () => {
  test('boots anonymous public playback without dash.js DRM setup errors and fetches encrypted video', async ({ page }) => {
    const consoleMessages: string[] = [];
    const requests: Array<{ headers: Record<string, string>; url: string }> = [];

    page.on('console', (message) => {
      consoleMessages.push(message.text());
    });

    page.on('request', (request) => {
      requests.push({
        headers: request.headers(),
        url: request.url(),
      });
    });

    await page.goto(`/player/${playbackFixtureVideoId}`);
    await expect(page).toHaveURL(new RegExp(`/player/${playbackFixtureVideoId}$`));
    await page.waitForSelector('[data-media-player][data-can-play]');
    await page.locator('[data-media-player] video').evaluate(async (player: HTMLVideoElement) => {
      await player.play();
    });
    await expect.poll(async () => page.locator('[data-media-player] video').evaluate((player: HTMLVideoElement) => ({
      currentTime: player.currentTime,
      paused: player.paused,
    })), {
      timeout: 10_000,
    }).toMatchObject({
      paused: false,
    });
    await expect.poll(async () => page.locator('[data-media-player] video').evaluate((player: HTMLVideoElement) => player.currentTime), {
      timeout: 10_000,
    }).toBeGreaterThan(0);

    const dashBootstrapErrors = consoleMessages.filter(message => message.includes('getSupportedKeySystemMetadataFromContentProtection'));
    const clearKeyWarnings = consoleMessages.filter(message => message.includes('ClearKey schemeIdURI'));
    const protectedRequests = requests.filter(request => request.url.includes(`/videos/${playbackFixtureVideoId}/`));
    const manifestRequests = protectedRequests.filter(request => request.url.includes(`/videos/${playbackFixtureVideoId}/manifest.mpd`));
    const protectedAudioRequests = protectedRequests.filter(request => request.url.includes(`/videos/${playbackFixtureVideoId}/audio/`));
    const protectedVideoRequests = protectedRequests.filter(request => request.url.includes(`/videos/${playbackFixtureVideoId}/video/`));

    expect(dashBootstrapErrors).toEqual([]);
    expect(clearKeyWarnings).toEqual([]);
    expect(manifestRequests.length).toBeGreaterThan(0);
    expect(protectedAudioRequests.length).toBeGreaterThan(0);
    expect(protectedVideoRequests.length).toBeGreaterThan(0);
    expect(protectedRequests.every(request => !request.url.includes('token='))).toBe(true);
    expect(protectedRequests.some(request => request.headers.authorization?.startsWith('Bearer '))).toBe(true);
  });

  test('seeks forward in protected playback and resumes authorized segment fetching', async ({ page }) => {
    const consoleMessages: string[] = [];
    const requests: Array<{ headers: Record<string, string>; url: string }> = [];
    const responses: Array<{ status: number; url: string }> = [];

    page.on('console', (message) => {
      consoleMessages.push(message.text());
    });

    page.on('request', (request) => {
      requests.push({
        headers: request.headers(),
        url: request.url(),
      });
    });

    page.on('response', (response) => {
      responses.push({
        status: response.status(),
        url: response.url(),
      });
    });

    await loginToPlayer(page, { videoId: playbackFixtureVideoId });
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
    }).toBeGreaterThan(1);

    const bufferedEndBeforeSeek = await player.evaluate((video: HTMLVideoElement) => (
      video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0
    ));
    const requestCountBeforeSeek = requests.length;
    const responseCountBeforeSeek = responses.length;
    expect(bufferedEndBeforeSeek).toBeLessThan(45);

    await player.evaluate((video: HTMLVideoElement) => {
      video.currentTime = 45;
    });

    await expect.poll(async () => player.evaluate((video: HTMLVideoElement) => ({
      currentTime: video.currentTime,
      readyState: video.readyState,
      seeking: video.seeking,
    })), {
      timeout: 10_000,
    }).toMatchObject({
      readyState: 4,
      seeking: false,
    });

    const currentTimeAfterSeek = await player.evaluate((video: HTMLVideoElement) => video.currentTime);
    expect(currentTimeAfterSeek).toBeGreaterThanOrEqual(40);

    await expect.poll(async () => player.evaluate((video: HTMLVideoElement) => video.currentTime), {
      timeout: 10_000,
    }).toBeGreaterThan(currentTimeAfterSeek + 1);

    const seekRequests = requests.slice(requestCountBeforeSeek);
    const seekResponses = responses.slice(responseCountBeforeSeek);
    const postSeekAudioRequests = seekRequests.filter(request => request.url.includes(`/videos/${playbackFixtureVideoId}/audio/`));
    const postSeekVideoRequests = seekRequests.filter(request => request.url.includes(`/videos/${playbackFixtureVideoId}/video/`));
    const unauthorizedSeekResponses = seekResponses.filter(response => (
      (response.status === 401 || response.status === 403) &&
      (response.url.includes(`/videos/${playbackFixtureVideoId}/audio/`) || response.url.includes(`/videos/${playbackFixtureVideoId}/video/`))
    ));
    const dashBootstrapErrors = consoleMessages.filter(message => message.includes('getSupportedKeySystemMetadataFromContentProtection'));

    await expect(page.getByText('Playback error')).toHaveCount(0);
    expect(dashBootstrapErrors).toEqual([]);
    expect(postSeekAudioRequests.length).toBeGreaterThan(0);
    expect(postSeekVideoRequests.length).toBeGreaterThan(0);
    expect(postSeekAudioRequests.every(request => !request.url.includes('token='))).toBe(true);
    expect(postSeekVideoRequests.every(request => !request.url.includes('token='))).toBe(true);
    expect(postSeekAudioRequests.every(request => request.headers.authorization?.startsWith('Bearer '))).toBe(true);
    expect(postSeekVideoRequests.every(request => request.headers.authorization?.startsWith('Bearer '))).toBe(true);
    expect(unauthorizedSeekResponses).toEqual([]);
  });
});
