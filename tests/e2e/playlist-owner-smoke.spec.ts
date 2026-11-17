import { expect, test } from '@playwright/test';
import { loginToPath } from './support/auth';
import { createPlaylistThroughUi } from './support/playlists';

test.describe('playlist owner smoke', () => {
  test('keeps creation reachable in a nonempty mobile catalog and fits all required widths', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginToPath(page, { redirectTo: '/playlists' });
    await createPlaylistThroughUi(page, 'Desktop catalog fixture');
    for (let index = 0; index < 21; index += 1) {
      const response = await page.request.post('/api/playlists', {
        headers: { Origin: new URL(page.url()).origin },
        data: {
          name: `Mobile catalog fixture ${index + 1}`,
          description: '',
          isPublic: false,
          type: 'user_created',
        },
      });
      expect(response.status()).toBe(201);
    }
    await page.goto('/playlists');
    await expect(page.getByRole('button', { name: 'Load more playlists' })).toBeVisible();
    for (const width of [320, 375, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const create = page.getByRole('button', { name: 'New playlist', exact: true });
      await expect(create).toBeVisible();
      const layout = await page.evaluate(() => {
        const header = document.querySelector('header');
        if (!header) {
          throw new Error('Expected the playlist header');
        }
        return {
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          header: header.scrollWidth,
        };
      });
      expect(layout.document, `Catalog layout at ${width}px`).toBeLessThanOrEqual(layout.viewport);
      expect(layout.header, `Header layout at ${width}px`).toBeLessThanOrEqual(layout.viewport);
      await create.click();
      const dialog = page.getByRole('dialog', { name: 'New playlist', exact: true });
      await expect(dialog).toBeVisible();
      const dialogBox = await dialog.boundingBox();
      if (!dialogBox) {
        throw new Error('Expected a visible playlist dialog');
      }
      expect(dialogBox.x).toBeGreaterThanOrEqual(0);
      expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(width);
      if (width === 320) {
        await dialog.getByLabel('Name', { exact: true }).fill('Mobile 320 persisted playlist');
        await dialog.getByRole('button', { name: 'Create playlist', exact: true }).click();
        await expect(page).toHaveURL(/\/playlists\/[^/?]+$/);
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: 'Mobile 320 persisted playlist',
            exact: true,
          }),
        ).toBeVisible();
        await page.goto('/playlists');
        await expect(
          page.getByRole('link', { name: 'Open Mobile 320 persisted playlist', exact: true }),
        ).toBeVisible();
      } else {
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      }
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Upload', exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Upload', exact: true }),
    ).toBeVisible();
  });
  test('lets the owner create a private playlist and reopen its persisted detail from the catalog', async ({
    page,
  }) => {
    await loginToPath(page, { expectedUrl: /\/playlists$/, redirectTo: '/playlists' });
    await expect(page.getByRole('heading', { level: 1, name: 'Playlists' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search playlists' })).toBeVisible();
    const detailPath = await createPlaylistThroughUi(page, 'Smoke Playlist');
    await expect(page.getByRole('button', { name: 'Edit playlist', exact: true })).toBeVisible();
    await expect(page.getByText('Private', { exact: true })).toBeVisible();
    await expect(page.getByText('0 available videos', { exact: true })).toBeVisible();
    await expect(
      page.getByText('No videos are available in this playlist.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add videos from library' })).toHaveAttribute(
      'href',
      '/',
    );
    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Smoke Playlist', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Product navigation' })
      .getByRole('link', { name: 'Playlists', exact: true })
      .click();
    const card = page.getByRole('link', { name: 'Open Smoke Playlist', exact: true });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('href', detailPath);
    await card.click();
    await expect(page).toHaveURL(new URL(detailPath, page.url()).href);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Smoke Playlist', exact: true }),
    ).toBeVisible();
  });
});
