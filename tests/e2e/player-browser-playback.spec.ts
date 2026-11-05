import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { loginToPlayer } from './support/player-auth';

const playbackFixtureVideoId = '68e5f819-15e8-41ef-90ee-8a96769311b7';
// License responses and Bearer headers must never be retained in a browser trace.
test.use({ trace: 'off' });

test.describe('Shaka protected browser playback', () => {
  test('cold loads anonymous public playback and decodes actual encrypted video through the Video.js controls', async ({
    page,
  }) => {
    const requests: Array<{ authorized: boolean; method: string; url: string }> = [];
    let pageErrorCount = 0;
    page.on('pageerror', () => {
      pageErrorCount++;
    });
    page.on('request', (request) => {
      requests.push({
        authorized: Object.entries(request.headers()).some(
          ([name, value]) => name.toLowerCase() === 'authorization' && value.startsWith('Bearer '),
        ),
        method: request.method(),
        url: request.url(),
      });
    });
    await page.goto(`/player/${playbackFixtureVideoId}`);
    const player = page.getByTestId('player-viewport');
    await expect
      .poll(() => player.locator('video').evaluate((video: HTMLVideoElement) => video.readyState))
      .toBeGreaterThanOrEqual(2);
    await expect(player.locator('[data-player-engine="shaka"]')).toHaveCount(1);
    await player.getByRole('button', { name: 'Play', exact: true }).click();
    const video = player.locator('video');
    await expect
      .poll(async () => video.evaluate((element: HTMLVideoElement) => element.currentTime), {
        timeout: 10_000,
      })
      .toBeGreaterThan(1);
    await expect
      .poll(
        async () =>
          video.evaluate(
            (element: HTMLVideoElement) => element.getVideoPlaybackQuality().totalVideoFrames,
          ),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(10);
    expect(await video.evaluate((element: HTMLVideoElement) => element.videoWidth)).toBeGreaterThan(
      0,
    );
    const protectedRequests = requests.filter(
      (request) =>
        request.url.includes(`/videos/${playbackFixtureVideoId}/`) &&
        !request.url.endsWith('/token'),
    );
    expect(protectedRequests.some((request) => request.url.endsWith('/manifest.mpd'))).toBe(true);
    expect(
      protectedRequests.some(
        (request) => request.url.endsWith('/clearkey') && request.method === 'POST',
      ),
    ).toBe(true);
    expect(protectedRequests.some((request) => request.url.includes('/audio/'))).toBe(true);
    expect(protectedRequests.some((request) => request.url.includes('/video/'))).toBe(true);
    expect(protectedRequests.every((request) => request.authorized)).toBe(true);
    expect(protectedRequests.every((request) => !new URL(request.url).search)).toBe(true);
    expect(pageErrorCount).toBe(0);
    await expect(page.getByText('Playback error', { exact: true })).toHaveCount(0);
  });

  test('seeks beyond the buffer and resumes authorized segment decoding for a signed in viewer', async ({
    page,
  }) => {
    const requests: Array<{ authorized: boolean; url: string }> = [];
    const responses: Array<{ status: number; url: string }> = [];
    page.on('request', (request) => {
      requests.push({
        authorized: Object.entries(request.headers()).some(
          ([name, value]) => name.toLowerCase() === 'authorization' && value.startsWith('Bearer '),
        ),
        url: request.url(),
      });
    });
    page.on('response', (response) => {
      responses.push({ status: response.status(), url: response.url() });
    });
    await loginToPlayer(page, { videoId: playbackFixtureVideoId });
    const player = page.getByTestId('player-viewport');
    await expect
      .poll(() => player.locator('video').evaluate((video: HTMLVideoElement) => video.readyState))
      .toBeGreaterThanOrEqual(2);
    await player.getByRole('button', { name: 'Play', exact: true }).click();
    const video = player.locator('video');
    await expect
      .poll(async () => video.evaluate((element: HTMLVideoElement) => element.currentTime), {
        timeout: 10_000,
      })
      .toBeGreaterThan(1);
    const bufferedEnd = await video.evaluate((element: HTMLVideoElement) =>
      element.buffered.length ? element.buffered.end(element.buffered.length - 1) : 0,
    );
    expect(bufferedEnd).toBeLessThan(45);
    const requestCount = requests.length;
    const responseCount = responses.length;
    await video.evaluate((element: HTMLVideoElement) => {
      element.currentTime = 45;
    });
    await expect
      .poll(
        async () =>
          video.evaluate((element: HTMLVideoElement) => ({
            ready: element.readyState,
            seeking: element.seeking,
          })),
        { timeout: 10_000 },
      )
      .toEqual({ ready: 4, seeking: false });
    const timeAfterSeek = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
    await expect
      .poll(async () => video.evaluate((element: HTMLVideoElement) => element.currentTime), {
        timeout: 10_000,
      })
      .toBeGreaterThan(timeAfterSeek + 1);
    const segmentRequests = requests
      .slice(requestCount)
      .filter(
        (request) =>
          request.url.includes(`/videos/${playbackFixtureVideoId}/audio/`) ||
          request.url.includes(`/videos/${playbackFixtureVideoId}/video/`),
      );
    expect(segmentRequests.some((request) => request.url.includes('/audio/'))).toBe(true);
    expect(segmentRequests.some((request) => request.url.includes('/video/'))).toBe(true);
    expect(
      segmentRequests.every((request) => request.authorized && !new URL(request.url).search),
    ).toBe(true);
    expect(
      responses
        .slice(responseCount)
        .filter(
          (response) =>
            response.url.includes(`/videos/${playbackFixtureVideoId}/`) &&
            [401, 403].includes(response.status),
        ),
    ).toEqual([]);
    await expect(page.getByText('Playback error', { exact: true })).toHaveCount(0);
    await page.goto('/');
    await expect(page.getByTestId('player-viewport').locator('video')).toHaveCount(0);
  });

  test('advances on a real media end, autoplays the accessible next item, and stops at the end of the queue', async ({
    page,
  }) => {
    const nextVideoId = '754c6828-621c-4df6-9cf8-a3d77297b85a';
    await loginToPlayer(page, { videoId: playbackFixtureVideoId });
    const origin = new URL(page.url()).origin;
    const created = await page.request.post('/api/playlists', {
      headers: { Origin: origin },
      data: {
        name: 'Browser playback queue',
        isPublic: true,
        initialVideoIds: [playbackFixtureVideoId, nextVideoId],
      },
    });
    expect(created.status()).toBe(201);
    const payload = z.object({ playlistId: z.string() }).parse(await created.json());
    const playlistId = payload.playlistId;
    try {
      await page.goto(`/player/${playbackFixtureVideoId}?playlist=${playlistId}`);
      const player = page.getByTestId('player-viewport');
      await expect
        .poll(() => player.locator('video').evaluate((video: HTMLVideoElement) => video.readyState))
        .toBeGreaterThanOrEqual(2);
      await expect(page.getByRole('region', { name: 'Playlist queue' })).toContainText(
        'Video 1 of 2',
      );
      await player.getByRole('button', { name: 'Play', exact: true }).click();
      await player.locator('video').evaluate((video: HTMLVideoElement) => {
        video.currentTime = video.duration - 0.7;
      });
      await expect(page).toHaveURL(new RegExp(`/player/${nextVideoId}\\?playlist=${playlistId}$`));
      await expect
        .poll(() => player.locator('video').evaluate((video: HTMLVideoElement) => video.readyState))
        .toBeGreaterThanOrEqual(2);
      await expect
        .poll(
          async () =>
            player.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime),
          { timeout: 10_000 },
        )
        .toBeGreaterThan(0.2);
      await expect
        .poll(async () =>
          player
            .locator('video')
            .evaluate(
              (video: HTMLVideoElement) => video.getVideoPlaybackQuality().totalVideoFrames,
            ),
        )
        .toBeGreaterThan(5);
      await player.locator('video').evaluate((video: HTMLVideoElement) => {
        video.currentTime = video.duration - 0.5;
      });
      await expect(page.getByText('End of playlist.', { exact: true })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/player/${nextVideoId}\\?playlist=${playlistId}$`));
      expect(
        await player
          .locator('video')
          .evaluate((video: HTMLVideoElement) => video.ended && video.paused),
      ).toBe(true);
      await expect(page.getByRole('button', { name: 'Next video' })).toBeDisabled();
    } finally {
      await page.request.delete(`/api/playlists/${playlistId}`, { headers: { Origin: origin } });
    }
  });
});
