import { type Page, expect } from '@playwright/test';

export async function createPlaylistThroughUi(page: Page, name: string): Promise<string> {
  await page.goto('/playlists');
  await page.getByRole('button', { name: 'New playlist', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New playlist', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Create playlist', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/playlists\/[^/?]+$/);
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  return new URL(page.url()).pathname;
}
