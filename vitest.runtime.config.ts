import { defineConfig } from 'vitest/config';
import { resolveViteEnvDir } from './scripts/vite-env-files.ts';

export default defineConfig({
  envDir: resolveViteEnvDir(process.env),
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['tests/smoke/**/*.test.ts'],
    // Allow the application to report its own 30-second shutdown deadline before hook timeout.
    hookTimeout: 45_000,
    testTimeout: 15_000,
    maxWorkers: 1,
  },
});
