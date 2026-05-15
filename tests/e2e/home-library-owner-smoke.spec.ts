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
});
