import { expect, test } from '@playwright/test';
import { OWNER_PRIVATE_VIDEO_ID } from '../support/create-runtime-test-workspace';
import { loginToPath } from './support/auth';
import { playbackTokenSchema } from './support/playback';

test('dirty editor Stay sends no logout; Discard sends one Framework POST and revokes the old session and grant', async ({
  page,
}) => {
  const editPath = `/videos/${OWNER_PRIVATE_VIDEO_ID}/edit`;
  await loginToPath(page, { redirectTo: editPath });
  const oldCookie = (await page.context().cookies())
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
  const tokenResponse = await page.request.get(`/videos/${OWNER_PRIVATE_VIDEO_ID}/token`);
  expect(tokenResponse.status()).toBe(200);
  const tokenBody: unknown = await tokenResponse.json();
  const grant = playbackTokenSchema.parse(tokenBody);
  const oldGrantHeaders = { Authorization: `Bearer ${grant.token}` };
  expect((await page.request.get(grant.urls.manifest, { headers: oldGrantHeaders })).status()).toBe(
    200,
  );

  let logoutPosts = 0;
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (
      request.method() === 'POST' &&
      (path === '/api/auth/logout.data' || path === '/api/auth/logout')
    ) {
      logoutPosts += 1;
    }
  });
  const title = page.getByLabel('Title', { exact: true });
  await title.fill('Unsaved logout regression draft');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Logout' }).click();
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
  expect(logoutPosts).toBe(0);
  await page.getByRole('button', { name: 'Stay', exact: true }).click();
  await expect(title).toHaveValue('Unsaved logout regression draft');
  expect((await page.request.get('/api/auth/me')).status()).toBe(200);
  expect((await page.request.get(grant.urls.manifest, { headers: oldGrantHeaders })).status()).toBe(
    200,
  );
  expect(logoutPosts).toBe(0);

  // Stay returns to the menu whose form remained mounted while navigation was blocked.
  await expect(page.getByRole('menuitem', { name: 'Logout' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Logout' }).click();
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/logout.data' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  expect((await responsePromise).status()).toBe(202);
  await expect(page).toHaveURL(/\/login$/);
  expect(logoutPosts).toBe(1);
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  expect(
    (await page.request.get('/api/auth/me', { headers: { Cookie: oldCookie } })).status(),
  ).toBe(401);
  expect((await page.request.get(grant.urls.manifest, { headers: oldGrantHeaders })).status()).toBe(
    401,
  );
});
