import { defineConfig, devices } from '@playwright/test';
import { createRuntimeTestWorkspace } from './tests/support/create-runtime-test-workspace';
import {
  type PlaywrightRuntimeMode,
  detectPlaywrightRuntimeMode,
} from './tests/support/detect-playwright-runtime-mode';
import { createRuntimeTestEnv } from './tests/support/runtime-test-env';

const port = 4173;
const runtimeMode = detectPlaywrightRuntimeMode(process.argv);
const runtimeWorkspace = runtimeMode === 'hermetic-smoke'
  ? await createRuntimeTestWorkspace()
  : null;

function createPlaywrightWebServerEnv(portValue: number): Record<string, string> {
  if (runtimeMode === 'hermetic-smoke' && runtimeWorkspace) {
    return createRuntimeTestEnv({
      PORT: String(portValue),
      MEDIAVAULT_STORAGE_DIR: runtimeWorkspace.storageDir,
    });
  }

  return createRuntimeTestEnv({
    PORT: String(portValue),
  });
}

if (runtimeWorkspace) {
  for (const signal of ['SIGINT', 'SIGTERM', 'exit'] as const) {
    process.on(signal, () => {
      void runtimeWorkspace.cleanup();
    });
  }
}

function createPlaywrightWebServerCommand(mode: PlaywrightRuntimeMode): string {
  if (mode === 'hermetic-smoke') {
    return 'bun --no-env-file run build && bun --no-env-file ./build/server/index.js';
  }

  return 'bun --no-env-file run build && bun --no-env-file run backfill:browser-playback-fixtures && bun --no-env-file ./build/server/index.js';
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  workers: runtimeMode === 'hermetic-smoke' ? 1 : undefined,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'on-first-retry',
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
    command: createPlaywrightWebServerCommand(runtimeMode),
    env: createPlaywrightWebServerEnv(port),
    reuseExistingServer: false,
    timeout: 180_000,
    url: `http://127.0.0.1:${port}`,
  },
});
