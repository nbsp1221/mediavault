import { expect, test } from '@playwright/test';
import { loginToPath } from './support/auth';

test.describe('playlist owner smoke', () => {
  test('lets the owner open playlists, create one, and open its detail page', async ({ page }) => {
    await loginToPath(page, {
      expectedUrl: /\/playlists$/,
      redirectTo: '/playlists',
    });
    await expect(page.getByRole('heading', { level: 1, name: 'Playlists' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'My Playlists' })).toBeVisible();

    await page.getByRole('button', { name: 'New Playlist' }).click();
    await page.getByLabel('Playlist Name *').fill('Smoke Playlist');
    await page.getByRole('button', { name: 'Create Playlist' }).click();

    await expect(page.getByText('Smoke Playlist')).toBeVisible();
    const createDialog = page.getByRole('dialog', { name: 'Create New Playlist' });
    if (await createDialog.isVisible()) {
      await page.keyboard.press('Escape');
      await expect(createDialog).not.toBeVisible();
    }
    await page.getByText('Smoke Playlist').click();

    await expect(page).toHaveURL(/\/playlists\/.+$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Playlist details' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Smoke Playlist' })).toBeVisible();
    await expect(page.getByText('Playlist Videos')).toBeVisible();
  });
});
