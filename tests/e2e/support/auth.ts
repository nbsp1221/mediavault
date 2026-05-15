import { type Page, expect } from '@playwright/test';
import { E2E_AUTH_PASSWORD, E2E_AUTH_USERNAME } from '../../support/auth-account';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function loginToPath(page: Page, input: {
  expectedUrl?: RegExp;
  redirectTo: string;
}) {
  const expectedUrl = input.expectedUrl ?? new RegExp(`${escapeRegExp(input.redirectTo)}$`);

  await page.goto(`/login?redirectTo=${encodeURIComponent(input.redirectTo)}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => (
    document.documentElement.dataset.localStreamerHydrated === 'true'
  ));
  await page.getByLabel('Username').fill(E2E_AUTH_USERNAME);
  await page.getByLabel('Password').fill(E2E_AUTH_PASSWORD);

  const loginResponsePromise = page.waitForResponse(response => (
    response.url().endsWith('/api/auth/login') &&
    response.request().method() === 'POST'
  ));

  await page.getByRole('button', { name: 'Sign in' }).click();

  const loginResponse = await loginResponsePromise;
  const loginBody = await loginResponse.json().catch(() => null) as unknown;

  expect(
    loginResponse.ok(),
    `Expected /api/auth/login to succeed, got ${loginResponse.status()} with ${JSON.stringify(loginBody)}`,
  ).toBe(true);
  expect(loginBody).toMatchObject({ success: true });

  await expect.poll(async () => {
    const cookies = await page.context().cookies();
    return cookies.some(cookie => cookie.name === 'site_session');
  }, {
    message: 'Expected browser context to store site_session after login',
  }).toBe(true);

  await page.waitForURL(expectedUrl, { timeout: 10_000 });
}
