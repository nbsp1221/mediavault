import { expect, test } from '@playwright/test';
import { loginToPath } from './support/auth';

test.describe('home library owner smoke', () => {
  test('boots the authenticated home route with loader bootstrap filters', async ({ page }) => {
    await loginToPath(page, {
      expectedUrl: /\/\?q=action&tag=action&type=clip&genre=action$/,
      redirectTo: '/?q=action&tag=action&type=clip&genre=action',
    });
    await expect(page.getByRole('heading', { level: 1, name: 'My Library' })).toBeVisible();
    await expect(page.getByLabel('Search library (desktop)')).toHaveValue('action');
    await expect(page.getByText('Active filters:')).toBeVisible();
    await expect(page.getByText('Has: action')).toBeVisible();
    await expect(page.getByText('Type: Clip')).toBeVisible();
    await expect(page.getByText('Genre: Action')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Playlists' })).toBeVisible();
  });

  test('shows public non-owner videos as watchable read-only items', async ({ page }) => {
    await loginToPath(page, {
      expectedUrl: /\/$/,
      redirectTo: '/',
    });

    const publicNonOwnerCard = page.getByRole('link', { name: /playtime2/ }).locator('xpath=..');

    await expect(publicNonOwnerCard).toBeVisible();
    await expect(publicNonOwnerCard.getByLabel('Private video')).toHaveCount(0);

    await publicNonOwnerCard.getByRole('button', { name: 'Open actions menu' }).click({ force: true });
    await page.getByRole('menuitem', { name: 'Quick view' }).click();

    await expect(page.getByRole('heading', { name: 'playtime2' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Watch' })).toHaveAttribute(
      'href',
      '/player/754c6828-621c-4df6-9cf8-a3d77297b85a',
    );
    await expect(page.getByRole('button', { name: 'Edit Info' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  });
});
