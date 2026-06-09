import { type Page, expect, test } from '@playwright/test';
import { loginToPlayer } from './support/player-auth';

const desktopVideoId = '68e5f819-15e8-41ef-90ee-8a96769311b7';
const filteredEmptyVideoId = '754c6828-621c-4df6-9cf8-a3d77297b85a';

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe('player layout', () => {
  test('renders the desktop watch page inside the product shell', async ({ page }) => {
    await page.setViewportSize({ height: 1200, width: 1440 });
    await loginToPlayer(page, { videoId: desktopVideoId });

    await expect(page).toHaveURL(new RegExp(`/player/${desktopVideoId}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'playtime' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Product navigation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Videos' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 2, name: 'Related videos' })).toBeVisible();
    await expect(page.getByText('Protected playback')).toHaveCount(0);
    await expect(page.getByText('Vault player')).toHaveCount(0);
    const playerViewport = page.getByTestId('player-viewport');
    const recommendations = page.getByRole('complementary', { name: 'Related videos' });

    await expect(playerViewport).toBeVisible();
    await expect(recommendations).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('collapses to a shell-backed single content column on mobile', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await loginToPlayer(page, { videoId: desktopVideoId });

    const playerViewport = page.getByTestId('player-viewport');
    const title = page.locator('main').getByRole('heading', { level: 2, name: 'playtime' });
    const relatedHeading = page.getByRole('heading', { level: 2, name: 'Related videos' });

    await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeVisible();
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
    await expectNoHorizontalOverflow(page);
  });

  test('keeps the watch surface overflow-safe across required widths', async ({ page }) => {
    for (const width of [320, 375, 768, 1024, 1280]) {
      await page.setViewportSize({ height: 900, width });
      await loginToPlayer(page, { videoId: desktopVideoId });

      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.getByTestId('player-viewport')).toBeVisible();
      await expect(page.getByRole('complementary', { name: 'Related videos' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test('uses a lightweight related empty state when filtering removes all results', async ({ page }) => {
    await page.setViewportSize({ height: 1200, width: 1440 });
    await loginToPlayer(page, { videoId: filteredEmptyVideoId });

    await expect(page).toHaveURL(new RegExp(`/player/${filteredEmptyVideoId}$`));

    await page.getByRole('button', { name: '#ui' }).click();

    const relatedRail = page.getByRole('complementary', { name: 'Related videos' });

    await expect(page.getByText('Filtered by #ui')).toBeVisible();
    await expect(page.getByText(/No related videos match #ui/i)).toBeVisible();
    await expect(relatedRail.locator('[data-slot="empty"]')).toHaveCount(0);
  });
});
