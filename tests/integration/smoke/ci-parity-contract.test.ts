import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('CI parity contract', () => {
  test('pins GitHub Actions Bun setup to the repo packageManager contract', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    const dockerfile = await readFile('Dockerfile', 'utf8');

    expect(workflow).toContain('bun-version-file: package.json');
    expect(workflow).not.toContain('bun-version: latest');
    expect(workflow).toContain('hashFiles(\'bun.lock\')');
    expect(dockerfile).toContain('FROM oven/bun:1.3.5 AS base');
    expect(dockerfile).toContain('FROM oven/bun:1.3.5 AS production');
  });

  test('runs a dedicated e2e-smoke workflow job through the standard e2e script', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    const packageJson = await readFile('package.json', 'utf8');

    expect(workflow).toContain('e2e-smoke:');
    expect(workflow).toContain('bun run verify:e2e-smoke');
    expect(packageJson).toContain('"test:e2e":');
    expect(packageJson).toContain('"verify:e2e-smoke":');
    expect(packageJson).toContain('tests/e2e/add-videos-owner-upload-smoke.spec.ts');
    expect(packageJson).toContain('tests/e2e/playlist-owner-smoke.spec.ts');
    expect(packageJson).toContain('"verify:ci-faithful":');
    expect(packageJson).toContain('"verify:ci-faithful:docker":');
    expect(packageJson).toContain('"verify:ci-worktree:docker":');
  });

  test('keeps coverage as a required base verification gate', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const viteConfig = await readFile('vite.config.ts', 'utf8');
    const changedFileCoverageEntrypoint = await readFile('scripts/test-coverage-changed.ts', 'utf8');
    const changedFileCoverageModule = await readFile('scripts/lib/coverage/changed-file-coverage.ts', 'utf8');
    const sharedChangedFilesModule = await readFile('scripts/lib/git/local-changed-files.ts', 'utf8');

    const baseline = JSON.parse(await readFile('tests/coverage-regression-baseline.json', 'utf8')) as {
      metrics?: Record<string, number>;
      minimumFloorPercentage?: number;
    };

    expect(packageJson.scripts['test:coverage']).toBe(
      'bun run test:coverage:collect && bun run test:coverage:regression && bun run test:coverage:changed',
    );
    expect(packageJson.scripts['test:coverage:collect']).toContain('run-vitest.ts run --coverage');
    expect(packageJson.scripts['test:coverage:collect']).toContain('--coverage.reporter=json-summary');
    expect(packageJson.scripts['test:coverage:regression']).toBe('LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/check-coverage-regression.ts');
    expect(packageJson.scripts['test:coverage:changed']).toBe('LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/test-coverage-changed.ts');
    expect(packageJson.scripts['test:coverage:update-baseline']).toBe('LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/update-coverage-baseline.ts');
    expect(packageJson.scripts.check).toContain('bun run test:coverage');
    expect(packageJson.scripts.check).not.toContain('bun run test:run');
    expect(packageJson.scripts.check).not.toContain('test:coverage:update-baseline');
    expect(workflow).not.toContain('test:coverage:changed');
    expect(workflow).toContain('coverage:');
    expect(workflow).toContain('run: bun run verify:hermetic-inputs && bun run test:coverage');
    expect(workflow).toContain('needs: [typecheck, lint, test, coverage, e2e-smoke, build]');
    expect(baseline.metrics).toEqual(expect.objectContaining({
      lines: expect.any(Number),
      branches: expect.any(Number),
      functions: expect.any(Number),
      statements: expect.any(Number),
    }));
    expect(baseline).toEqual(expect.objectContaining({
      tolerancePercentagePoints: 0.25,
    }));
    expect(baseline).not.toHaveProperty('minimumFloorPercentage');
    expect(viteConfig).toContain('provider: \'v8\'');
    expect(viteConfig).not.toContain('fileParallelism: false');
    expect(viteConfig).toContain('name: \'modules\'');
    expect(viteConfig).toContain('include: [\'app/**/*.{ts,tsx}\']');
    expect(viteConfig).toContain('lines: 80');
    expect(viteConfig).toContain('branches: 80');
    expect(viteConfig).toContain('functions: 80');
    expect(viteConfig).toContain('statements: 80');
    expect(changedFileCoverageEntrypoint).toContain('runChangedFileCoverage');
    expect(changedFileCoverageEntrypoint).toContain('./lib/coverage/changed-file-coverage');
    expect(changedFileCoverageEntrypoint).toContain('process.exit(await runChangedFileCoverage())');
    expect(changedFileCoverageModule).toContain('const THRESHOLD_PERCENTAGE = 80');
    expect(changedFileCoverageModule).toContain('../git/local-changed-files');
    expect(sharedChangedFilesModule).toContain('git');
    expect(sharedChangedFilesModule).toContain('diff');
    expect(sharedChangedFilesModule).toContain('HEAD');
    expect(sharedChangedFilesModule).toContain('ls-files');
    expect(sharedChangedFilesModule).toContain('--others');
    expect(sharedChangedFilesModule).toContain('--exclude-standard');
    expect(changedFileCoverageModule).toContain('`--coverage.thresholds.lines=${THRESHOLD_PERCENTAGE}`');
    expect(changedFileCoverageModule).toContain('`--coverage.thresholds.branches=${THRESHOLD_PERCENTAGE}`');
    expect(changedFileCoverageModule).toContain('`--coverage.thresholds.functions=${THRESHOLD_PERCENTAGE}`');
    expect(changedFileCoverageModule).toContain('`--coverage.thresholds.statements=${THRESHOLD_PERCENTAGE}`');
  });

  test('keeps changed-file mutation as a required local base verification gate', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const verificationContract = await readFile('docs/verification-contract.md', 'utf8');
    const vitestEntrypoint = await readFile('scripts/run-vitest.ts', 'utf8');
    const changedFileMutationEntrypoint = await readFile('scripts/test-mutation-changed.ts', 'utf8');
    const changedFileMutationModule = await readFile('scripts/lib/mutation/changed-file-mutation.ts', 'utf8');
    const sharedChangedFilesModule = await readFile('scripts/lib/git/local-changed-files.ts', 'utf8');

    expect(vitestEntrypoint).toContain('process.env.MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS ??= \'1\'');
    expect(vitestEntrypoint).toContain('env: process.env');
    expect(packageJson.scripts['test:mutation']).toBe(
      'MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS=1 LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file x stryker run',
    );
    expect(packageJson.scripts['test:mutation:changed']).toBe(
      'MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS=1 LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/test-mutation-changed.ts',
    );
    expect(packageJson.scripts['test:smoke:bun-auth']).toContain('bun --no-env-file run build');
    expect(packageJson.scripts['test:smoke:bun-auth']).toContain('bun --no-env-file run test:smoke:bun-auth:run');
    expect(packageJson.scripts['test:smoke:bun-auth:run']).toBe(
      'LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file test ./tests/smoke/bun-auth-gate.test.ts',
    );
    expect(packageJson.scripts.check).not.toContain('bun run test &&');
    expect(packageJson.scripts.check).toContain('bun run typecheck && bun run test:smoke:dev-auth');
    expect(packageJson.scripts.check).toContain('bun run test:smoke:dev-auth && bun run test:coverage');
    expect(packageJson.scripts.check).toContain('bun run test:coverage && bun run test:mutation:changed && bun run build');
    expect(packageJson.scripts.check).toContain('bun run build && bun run test:smoke:bun-auth:run');
    expect(packageJson.scripts.check).not.toContain('bun run test:mutation &&');
    expect(workflow).not.toContain('mutation-changed:');
    expect(workflow).not.toContain('run: bun run test:mutation:changed');
    expect(workflow).toContain('needs: [typecheck, lint, test, coverage, e2e-smoke, build]');
    expect(changedFileMutationEntrypoint).toContain('runChangedFileMutation');
    expect(changedFileMutationEntrypoint).toContain('./lib/mutation/changed-file-mutation');
    expect(changedFileMutationEntrypoint).toContain('process.exit(await runChangedFileMutation())');
    expect(changedFileMutationModule).toContain('../git/local-changed-files');
    expect(changedFileMutationModule).not.toContain('--incremental');
    expect(changedFileMutationModule).not.toContain('--force');
    expect(changedFileMutationModule).not.toContain('changed-incremental');
    expect(changedFileMutationModule).toContain('options.files.join(\',\')');
    expect(sharedChangedFilesModule).toContain('--diff-filter=ACMRT');
    expect(verificationContract).toContain('bun run test:mutation:changed');
    expect(verificationContract).toContain('Changed-file mutation is intentionally local-only in GitHub Actions');
    expect(verificationContract).toContain('Test-facing Vitest, Stryker, and runtime smoke helpers set `MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS=1`');
    expect(verificationContract).toContain('inherits the shared `thresholds.break: 70` mutation-score floor');
  });

  test('keeps Bun version enforcement at install time instead of repeating a custom prefix across every verification script', async () => {
    const packageJson = await readFile('package.json', 'utf8');

    expect(packageJson).toContain('"preinstall": "bun --no-env-file ./scripts/verify-bun-version.ts"');
    expect(packageJson).not.toContain('./scripts/verify-bun-version.ts && eslint .');
    expect(packageJson).not.toContain('./scripts/verify-bun-version.ts && react-router typegen && tsc');
    expect(packageJson).not.toContain('./scripts/verify-bun-version.ts && LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/run-vitest.ts');
    expect(packageJson).not.toContain('./scripts/verify-bun-version.ts && react-router build');
    expect(packageJson).not.toContain('./scripts/verify-bun-version.ts && LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=Etc/UTC LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file x playwright test');
  });

  test('keeps executable parity contracts on code and config surfaces only', async () => {
    const playwrightConfig = await readFile('playwright.config.ts', 'utf8');

    expect(playwrightConfig).toContain('detectPlaywrightRuntimeMode(process.argv)');
    expect(playwrightConfig).toContain('timezoneId: \'UTC\'');
    expect(playwrightConfig).toContain('locale: \'en-US\'');
    expect(playwrightConfig).toContain('bun --no-env-file run build && bun --no-env-file ./build/server/index.js');
  });

  test('runs clean-checkout CI-faithful verification from tracked inputs only', async () => {
    const packageJson = await readFile('package.json', 'utf8');
    const cleanExportScript = await readFile('scripts/verify-ci-clean-export.sh', 'utf8');
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');

    expect(packageJson).toContain('scripts/verify-hermetic-test-inputs.ts');
    expect(packageJson).toContain('"verify:ci-clean-export":');
    expect(cleanExportScript).toContain('git checkout-index --all --force --prefix="$tmpdir"/');
    expect(cleanExportScript).toContain('bun run verify:ci-faithful');
    expect(workflow).toContain('bun run verify:e2e-smoke');
  });

  test('pre-bundles player-only dev dependencies before the first player navigation', async () => {
    const viteConfig = await readFile('vite.config.ts', 'utf8');

    expect(viteConfig).toContain('optimizeDeps: {');
    expect(viteConfig).toContain('include: [');
    expect(viteConfig).toContain('\'@vidstack/react\'');
    expect(viteConfig).toContain('\'@vidstack/react/player/layouts/default\'');
    expect(viteConfig).toContain('\'dashjs\'');
  });

  test('lets React Router pre-optimize route-level dev dependencies before first route navigation', async () => {
    const reactRouterConfig = await readFile('react-router.config.ts', 'utf8');
    const viteConfig = await readFile('vite.config.ts', 'utf8');

    expect(reactRouterConfig).toContain('future: {');
    expect(reactRouterConfig).toContain('unstable_optimizeDeps: true');
    expect(viteConfig).toContain('entries: [');
    expect(viteConfig).toContain('\'app/entry.client.tsx\'');
    expect(viteConfig).toContain('\'app/root.tsx\'');
    expect(viteConfig).toContain('\'app/routes/**/*.{ts,tsx}\'');
    expect(viteConfig).toContain('\'!app/routes/**/*.server.{ts,tsx}\'');
    expect(viteConfig).toContain('\'!app/routes/**/*.test.{ts,tsx}\'');
  });
});
