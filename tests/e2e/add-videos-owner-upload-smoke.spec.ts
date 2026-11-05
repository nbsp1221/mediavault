import path from 'node:path';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { ingestJobViewSchema } from '../../app/modules/ingest/domain/ingest-job-view';
import { loginToPath } from './support/auth';
import { hasBearerHeader, playVideoThroughControls } from './support/playback';

const uploadFixturePath = path.resolve('tests/fixtures/upload/smoke-upload.mp4');
const jobResponseSchema = z.object({ success: z.literal(true), job: ingestJobViewSchema });

test.describe('add-videos owner upload smoke', () => {
  test('accepts a background job, publishes the ready video, and decodes it from the library', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const requests: Array<{ authorized: boolean; method: string; url: string }> = [];
    const responses: Array<{ status: number; url: string }> = [];
    page.on('request', (request) => {
      requests.push({
        authorized: hasBearerHeader(request.headers()),
        method: request.method(),
        url: request.url(),
      });
    });
    page.on('response', (response) => {
      responses.push({ status: response.status(), url: response.url() });
    });
    await loginToPath(page, { expectedUrl: /\/add-videos$/, redirectTo: '/add-videos' });
    await page.locator('#choose-video-input').setInputFiles(uploadFixturePath);
    await expect(page.getByRole('heading', { level: 2, name: 'smoke-upload.mp4' })).toBeVisible();
    await expect(page.getByText('Ready to Add')).toBeVisible();
    await page.getByLabel('Title *').fill('Uploaded Smoke Fixture');
    await page.getByLabel('Tags').fill('가족 여행 C++');
    await page.getByLabel('Tags').press('Enter');
    await expect(page.getByText('가족 여행 c++')).toBeVisible();
    const acceptedPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/uploads/') &&
        response.url().endsWith('/commit') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Add to Library' }).click();
    const accepted = await acceptedPromise;
    expect(accepted.status()).toBe(202);
    const acceptedJob = jobResponseSchema.parse(await accepted.json()).job;
    expect(acceptedJob.metadata.tags).toContain('가족 여행 c++');
    expect(acceptedJob.videoId).toBeNull();
    const statusUrl = `/api/ingest-jobs/${encodeURIComponent(acceptedJob.id)}`;
    expect(accepted.headers().location).toBe(statusUrl);
    await expect
      .poll(
        async () => {
          const response = await page.request.get(statusUrl);
          expect(response.status()).toBe(200);
          return jobResponseSchema.parse(await response.json()).job.state;
        },
        { timeout: 90_000, intervals: [250, 500, 1000] },
      )
      .toBe('succeeded');
    const succeeded = jobResponseSchema
      .extend({
        job: ingestJobViewSchema.extend({
          state: z.literal('succeeded'),
          videoId: z.string().min(1),
        }),
      })
      .parse(await (await page.request.get(statusUrl)).json()).job;
    const videoId = succeeded.videoId;
    expect(succeeded.id).toBe(acceptedJob.id);
    const jobCard = page.getByLabel('Processing Uploaded Smoke Fixture', { exact: true });
    await expect(jobCard.getByRole('status')).toHaveText(
      '"Uploaded Smoke Fixture" has been added to the library.',
      { timeout: 30_000 },
    );
    await expect(jobCard.getByText('Added privately', { exact: true })).toBeVisible();
    await expect(jobCard.getByRole('link', { name: 'Watch video' })).toHaveAttribute(
      'href',
      `/player/${videoId}`,
    );
    await page.getByRole('button', { name: 'Upload Another Video' }).click();
    await expect(page.getByRole('button', { name: 'Choose Video' })).toBeVisible();
    await page.goto(`/?${new URLSearchParams({ q: '가족 여행 C++', tag: '가족 여행 c++' })}`);
    await expect(page.getByText('Has: 가족 여행 c++')).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 3, name: 'Uploaded Smoke Fixture' }).first(),
    ).toBeVisible();
    await page.goto(`/player/${videoId}`);
    await playVideoThroughControls(page);
    const protectedRequests = requests.filter((request) =>
      request.url.includes(`/videos/${videoId}/`),
    );
    expect(protectedRequests.some((request) => request.url.endsWith('/token'))).toBe(true);
    expect(
      protectedRequests.some(
        (request) => request.url.endsWith('/clearkey') && request.method === 'POST',
      ),
    ).toBe(true);
    expect(protectedRequests.some((request) => request.url.endsWith('/manifest.mpd'))).toBe(true);
    expect(protectedRequests.some((request) => request.url.includes('/audio/'))).toBe(true);
    expect(protectedRequests.some((request) => request.url.includes('/video/'))).toBe(true);
    expect(protectedRequests.every((request) => !new URL(request.url).search)).toBe(true);
    expect(
      protectedRequests
        .filter((request) => !request.url.endsWith('/token'))
        .every((request) => request.authorized),
    ).toBe(true);
    expect(
      responses.some(
        (response) =>
          response.status === 200 && response.url.endsWith(`/videos/${videoId}/manifest.mpd`),
      ),
    ).toBe(true);
    expect(
      responses.filter(
        (response) =>
          [401, 403].includes(response.status) && response.url.includes(`/videos/${videoId}/`),
      ),
    ).toEqual([]);
  });
});
