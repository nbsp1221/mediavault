import { defineConfig, devices } from '@playwright/test';
import { createRuntimeTestWorkspace } from './tests/support/create-runtime-test-workspace';
import { createRuntimeTestEnv } from './tests/support/runtime-test-env';

const port = 4173;
const runtimeWorkspace = await createRuntimeTestWorkspace();

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  workers: 1,
  metadata: {
    runtimeWorkspaceRoot: runtimeWorkspace.rootDir,
  },
  globalTeardown: './tests/support/playwright-global-teardown.ts',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'en-US',
    timezoneId: 'UTC',
    // Authenticated media traffic contains session cookies, Bearer credentials and ClearKey licenses.
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: 'pnpm build && node ./server.mjs',
    env: createRuntimeTestEnv({
      PORT: String(port),
      MEDIAVAULT_STORAGE_DIR: runtimeWorkspace.storageDir,
    }),
    reuseExistingServer: false,
    timeout: 180_000,
    url: `http://127.0.0.1:${port}`,
  },
});
