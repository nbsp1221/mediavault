import { type Page, expect } from '@playwright/test';
import { z } from 'zod';

export const playbackTokenSchema = z.object({
  success: z.literal(true),
  token: z.string().min(1),
  urls: z.object({ manifest: z.string(), clearkey: z.string() }),
});

export function hasBearerHeader(headers: Record<string, string>): boolean {
  return Object.entries(headers).some(
    ([name, value]) => name.toLowerCase() === 'authorization' && value.startsWith('Bearer '),
  );
}

export function playerVideo(page: Page) {
  return page.getByTestId('player-viewport').locator('video');
}

export async function expectDecodedPlayback(page: Page) {
  const video = playerVideo(page);
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0.2);
  await expect
    .poll(
      () =>
        video.evaluate(
          (element: HTMLVideoElement) => element.getVideoPlaybackQuality().totalVideoFrames,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(5);
  expect(await video.evaluate((element: HTMLVideoElement) => element.videoWidth)).toBeGreaterThan(
    0,
  );
  await expect(page.getByText('Playback error', { exact: true })).toHaveCount(0);
}

export async function playVideoThroughControls(page: Page) {
  const viewport = page.getByTestId('player-viewport');
  await expect
    .poll(() => playerVideo(page).evaluate((element: HTMLVideoElement) => element.readyState))
    .toBeGreaterThanOrEqual(2);
  await viewport.getByRole('button', { name: 'Play', exact: true }).click();
  await expectDecodedPlayback(page);
}
