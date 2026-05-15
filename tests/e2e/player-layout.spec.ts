import { expect, test } from '@playwright/test';
import { loginToPlayer } from './support/player-auth';

const desktopVideoId = '68e5f819-15e8-41ef-90ee-8a96769311b7';
const filteredEmptyVideoId = '754c6828-621c-4df6-9cf8-a3d77297b85a';
test.describe('player layout', () => {
  test('keeps the desktop watch page content-first without decorative chrome', async ({ page }) => {
    await page.setViewportSize({ height: 1200, width: 1440 });
    await loginToPlayer(page, { videoId: desktopVideoId });

    await expect(page).toHaveURL(new RegExp(`/player/${desktopVideoId}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'playtime' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Related videos' })).toBeVisible();
    await expect(page.getByText('Protected playback')).toHaveCount(0);
    await expect(page.getByText('Vault player')).toHaveCount(0);
    const playerViewport = page.getByTestId('player-viewport');
    const recommendations = page.locator('aside');

    await expect(playerViewport).toBeVisible();
    await expect(recommendations).toBeVisible();
  });

  test('collapses to a single content column on mobile', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await loginToPlayer(page, { videoId: desktopVideoId });

    const playerViewport = page.getByTestId('player-viewport');
    const title = page.getByRole('heading', { level: 1, name: 'playtime' });
    const relatedHeading = page.getByRole('heading', { level: 2, name: 'Related videos' });

    await expect(playerViewport).toBeVisible();
    await expect(title).toBeVisible();
    await expect(relatedHeading).toBeVisible();

    const order = await Promise.all([
      playerViewport.boundingBox(),
      title.boundingBox(),
      relatedHeading.boundingBox(),
    ]);

    expect(order[0]?.y ?? 0).toBeLessThan(order[1]?.y ?? 0);
    expect(order[1]?.y ?? 0).toBeLessThan(order[2]?.y ?? 0);
  });

  test('uses a lightweight related empty state when filtering removes all results', async ({ page }) => {
    await page.setViewportSize({ height: 1200, width: 1440 });
    await loginToPlayer(page, { videoId: filteredEmptyVideoId });

    await expect(page).toHaveURL(new RegExp(`/player/${filteredEmptyVideoId}$`));

    await page.getByRole('button', { name: '#ui' }).click();

    const relatedRail = page.locator('aside');

    await expect(page.getByText('Filtered by #ui')).toBeVisible();
    await expect(page.getByText(/No related videos match #ui/i)).toBeVisible();
    await expect(relatedRail.locator('[data-slot="empty"]')).toHaveCount(0);
  });
});
