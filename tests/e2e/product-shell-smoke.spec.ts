import { type Locator, type Page, expect, test } from '@playwright/test';
import { OTHER_PUBLIC_VIDEO_ID, OWNER_PRIVATE_VIDEO_ID } from '../support/create-runtime-test-workspace';
import { loginToPath } from './support/auth';

const consoleErrorsByPage = new WeakMap<Page, string[]>();

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
}

async function expectCompactDesktopNavigationItem(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(32);
}

async function expectDesktopIconButton(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(40);
  expect(box?.height).toBeGreaterThanOrEqual(40);
}

async function expectDesktopHeaderAndBrandHeightsAligned(page: Page) {
  const headerTopRow = page.locator('header > div').first();
  const sidebarBrandArea = page.getByLabel('Mediavault home').locator('..');
  const [headerBox, brandBox] = await Promise.all([
    headerTopRow.boundingBox(),
    sidebarBrandArea.boundingBox(),
  ]);

  expect(headerBox?.height).toBe(72);
  expect(brandBox?.height).toBe(72);
}

async function createPlaylistThroughUi(page: Page, name: string) {
  await page.goto('/playlists');
  await page.getByRole('button', { name: 'New Playlist' }).click();
  await page.getByLabel('Playlist Name *').fill(name);
  await page.getByRole('button', { name: 'Create Playlist' }).click();
  await expect(page.getByText(name)).toBeVisible();
  const createDialog = page.getByRole('dialog', { name: 'Create New Playlist' });
  if (await createDialog.isVisible()) {
    await page.keyboard.press('Escape');
    await expect(createDialog).not.toBeVisible();
  }
  await page.getByText(name).click();
  await expect(page).toHaveURL(/\/playlists\/.+$/);
  return new URL(page.url()).pathname;
}

test.describe('product shell smoke', () => {
  test.beforeEach(({ page }) => {
    const errors: string[] = [];
    consoleErrorsByPage.set(page, errors);
    page.on('console', (message) => {
      if (message.type() === 'error') {
        if (message.text().includes('Failed to load resource: the server responded with a status of 401')) {
          return;
        }
        errors.push(message.text());
      }
    });
    page.on('pageerror', error => errors.push(error.message));
  });

  test.afterEach(({ page }) => {
    expect(consoleErrorsByPage.get(page) ?? []).toEqual([]);
  });

  test('keeps anonymous visitors in the public library shell only', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Videos' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Product navigation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Videos' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'Playlists' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Upload' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0);
  });

  test('lets owners navigate the product shell and keeps coming-soon destinations non-navigational', async ({ page }) => {
    await loginToPath(page, {
      expectedUrl: /\/$/,
      redirectTo: '/',
    });

    await expect(page.getByRole('heading', { level: 1, name: 'Videos' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Videos' })).toHaveAttribute('aria-current', 'page');
    await expectCompactDesktopNavigationItem(page.getByRole('link', { name: 'Videos' }));
    await expectDesktopIconButton(page.getByRole('button', { name: 'Account menu' }));

    await page.getByRole('button', { name: 'Favorites, Soon' }).click();
    await expect(page.getByText('Favorites is coming soon.')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    const productNavigation = page.getByRole('navigation', { name: 'Product navigation' });
    await productNavigation.getByRole('link', { name: 'Upload' }).click();
    await expect(page).toHaveURL(/\/add-videos$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Upload a video' })).toBeVisible();
    await expect(productNavigation.getByRole('link', { name: 'Upload' })).toHaveAttribute('aria-current', 'page');

    await productNavigation.getByRole('link', { name: 'Playlists' }).click();
    await expect(page).toHaveURL(/\/playlists$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Playlists' })).toBeVisible();
    await expect(productNavigation.getByRole('link', { name: 'Playlists' })).toHaveAttribute('aria-current', 'page');
  });

  test('opens the mobile navigation drawer with the same owner destinations', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await loginToPath(page, {
      expectedUrl: /\/$/,
      redirectTo: '/',
    });

    await expect(page.getByLabel('Product sidebar')).toHaveCount(0);
    const menuButton = page.locator('button[aria-controls="product-mobile-navigation"]');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(menuButton).toHaveAttribute('aria-controls', 'product-mobile-navigation');
    await expectTouchTarget(menuButton);

    await menuButton.click();

    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    const drawer = page.getByRole('dialog', { name: 'Navigation menu' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Videos' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Upload' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Settings, Soon' })).toBeVisible();
  });

  test('keeps shell-backed routes overflow-safe at required viewport widths', async ({ page }) => {
    await loginToPath(page, {
      expectedUrl: /\/$/,
      redirectTo: '/',
    });
    const playlistPath = await createPlaylistThroughUi(page, 'Shell Matrix Playlist');

    const shellRoutes = [
      '/',
      '/add-videos',
      '/playlists',
      playlistPath,
      `/videos/${OWNER_PRIVATE_VIDEO_ID}/edit`,
    ];

    for (const width of [320, 375, 768, 1024, 1280]) {
      await page.setViewportSize({ height: 900, width });

      for (const route of shellRoutes) {
        await page.goto(route);
        await expect(page.locator('main')).toHaveCount(1);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        if (width < 768) {
          await expect(page.getByLabel('Product sidebar')).not.toBeVisible();
          const mobileNavigationButton = page.locator('button[aria-controls="product-mobile-navigation"]');
          if (route.startsWith('/videos/')) {
            await expect(mobileNavigationButton).toHaveCount(0);
            await expect(page.getByRole('banner').getByRole('button', { name: 'Back to library' })).toBeVisible();
          }
          else {
            await expect(mobileNavigationButton).toBeVisible();
            await expectTouchTarget(mobileNavigationButton);
          }
        }
        else {
          const productNavigation = page.getByRole('navigation', { name: 'Product navigation' });
          await expect(page.getByLabel('Product sidebar')).toBeVisible();
          await expect(page.getByRole('button', { name: 'Open navigation menu' })).not.toBeVisible();
          await expect(productNavigation).toBeVisible();
          await expectDesktopHeaderAndBrandHeightsAligned(page);

          if (route === '/') {
            await expect(productNavigation.getByRole('link', { name: 'Videos' })).toHaveAttribute('aria-current', 'page');
            await expect(page.getByRole('banner').getByRole('link', { name: 'Upload' })).toBeVisible();
          }
          else if (route === '/add-videos') {
            await expect(productNavigation.getByRole('link', { name: 'Upload' })).toHaveAttribute('aria-current', 'page');
          }
          else if (route.startsWith('/playlists')) {
            await expect(productNavigation.getByRole('link', { name: 'Playlists' })).toHaveAttribute('aria-current', 'page');
            if (route === '/playlists') {
              await expect(page.getByRole('banner').getByRole('button', { name: 'New Playlist' })).toBeVisible();
            }
          }
          else {
            await expect(productNavigation.getByRole('link', { name: 'Videos' })).toHaveAttribute('aria-current', 'page');
            await expect(page.getByRole('banner').getByRole('button', { name: 'Back to library' })).toBeVisible();
            await expect(page.getByRole('region', { name: 'Basic information' })).toBeVisible();
            await expect(page.getByRole('region', { name: 'Classification' })).toBeVisible();
            await expect(page.getByRole('region', { name: 'Visibility' })).toBeVisible();
            await expect(page.getByRole('region', { name: 'Danger zone' })).toBeVisible();
          }
        }

        await expectNoHorizontalOverflow(page);
      }
    }
  });

  test('exposes the video details edit shell at desktop and mobile widths', async ({ page }) => {
    await loginToPath(page, {
      redirectTo: `/videos/${OWNER_PRIVATE_VIDEO_ID}/edit`,
    });

    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto(`/videos/${OWNER_PRIVATE_VIDEO_ID}/edit`);
    await expect(page.getByRole('banner').getByRole('button', { name: 'Back to library' })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Save changes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ height: 900, width: 390 });
    await page.goto(`/videos/${OWNER_PRIVATE_VIDEO_ID}/edit`);
    await expect(page.getByRole('banner').getByRole('button', { name: 'Back to library' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open navigation menu' })).not.toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Account menu' })).not.toBeVisible();

    const sectionOrder = await Promise.all(
      ['Basic information', 'Classification', 'Visibility', 'Danger zone'].map(async (name) => {
        const box = await page.getByRole('region', { name }).boundingBox();
        return box?.y ?? null;
      }),
    );
    expect(sectionOrder.every(value => typeof value === 'number')).toBe(true);
    expect(sectionOrder[0]!).toBeLessThan(sectionOrder[1]!);
    expect(sectionOrder[1]!).toBeLessThan(sectionOrder[2]!);
    expect(sectionOrder[2]!).toBeLessThan(sectionOrder[3]!);
    await expectNoHorizontalOverflow(page);
  });

  test('keeps login and player routes outside the product shell', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('navigation', { name: 'Product navigation' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0);

    for (const width of [320, 375, 768, 1024, 1280]) {
      await page.setViewportSize({ height: 900, width });
      await page.goto(`/player/${OTHER_PUBLIC_VIDEO_ID}`);
      await expect(page.getByTestId('player-viewport')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Product navigation' })).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    }
  });
});
