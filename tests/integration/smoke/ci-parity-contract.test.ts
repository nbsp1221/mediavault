import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

const readPackageScripts = async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };

  return packageJson.scripts;
};

const expectCommandOrder = (command: string, expectedParts: string[]) => {
  let lastIndex = -1;

  for (const part of expectedParts) {
    const index = command.indexOf(part);
    expect(index).toBeGreaterThan(lastIndex);
    lastIndex = index;
  }
};

const expectCommandNotToRun = (command: string, scriptName: string) => {
  expect(command).not.toMatch(new RegExp(`(?:^|&&\\s*)bun run ${scriptName}(?:\\s|&&|$)`));
};

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

  test('keeps test and check scripts scoped by command role', async () => {
    const scripts = await readPackageScripts();

    expect(scripts.test).toBe('bun --no-env-file ./scripts/run-vitest.ts run');
    expect(scripts['test:run']).toBe('bun run test');
    expect(scripts['test:coverage']).toBe(
      'bun run test:coverage:collect && bun run test:coverage:regression && bun run test:coverage:changed',
    );
    expect(scripts['test:mutation:changed']).toBe('bun --no-env-file ./scripts/test-mutation-changed.ts');
    expect(scripts['test:e2e']).toBe('bun --no-env-file ./scripts/run-playwright.ts');
    expect(scripts['test:e2e:smoke']).toBe('bun --no-env-file ./scripts/run-e2e-smoke.ts');
    expect(scripts['test:runtime:smoke']).toBe('bun --no-env-file ./scripts/run-runtime-smoke.ts');
    expect(scripts['backfill:browser-playback-fixtures']).toBe('bun scripts/backfill-browser-compatible-playback.ts');
    expect(scripts['test:e2e:smoke']).not.toContain('&&');
    expect(scripts['test:e2e:smoke']).not.toContain(' if ');
    expect(scripts['test:runtime:smoke']).not.toContain('&&');
    expect(scripts['test:smoke:dev-auth']).toBeUndefined();
    expect(scripts['test:smoke:bun-auth']).toBeUndefined();
    expect(scripts['test:smoke:bun-auth:run']).toBeUndefined();

    expect(scripts['check:fast']).toBe(
      'bun run check:hermetic-inputs && bun run design:lint && bun run lint && bun run typecheck && bun run test',
    );
    expect(scripts['check:fast']).not.toContain('test:coverage');
    expect(scripts['check:fast']).not.toContain('test:mutation:changed');
    expect(scripts['check:fast']).not.toContain('test:e2e:smoke');
    expect(scripts['check:fast']).not.toContain('check:docker-compose-smoke');

    expectCommandOrder(scripts.check, [
      'bun run check:hermetic-inputs',
      'bun run design:lint',
      'bun run lint',
      'bun run typecheck',
      'bun run test:coverage',
      'bun run test:mutation:changed',
      'bun run test:runtime:smoke',
    ]);
    expect(scripts.check).not.toContain('bun run test &&');
    expect(scripts.check).not.toContain('bun run test:mutation &&');
    expect(scripts.check).not.toContain('bun run test:e2e:smoke');
    expect(scripts.check).not.toContain('bun run check:docker-compose-smoke');
    expect(scripts.check).not.toContain('test:coverage:update-baseline');

    expect(scripts['check:runtime']).toBe('bun run check && bun run test:e2e:smoke && bun run check:docker-compose-smoke');
    expect(scripts['check:docker-worktree']).toBe('bash ./scripts/verify-ci-worktree-docker.sh');

    for (const oldScript of [
      'verify:hermetic-inputs',
      'verify:e2e-smoke',
      'verify:data-integrity',
      'verify:docker-compose-smoke',
      'verify:ci-faithful',
      'verify:ci-faithful:docker',
      'verify:ci-clean-export',
      'verify:ci-worktree:docker',
    ]) {
      expect(scripts[oldScript]).toBeUndefined();
    }
  });

  test('keeps coverage as a required base verification gate', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    const scripts = await readPackageScripts();
    const viteConfig = await readFile('vite.config.ts', 'utf8');
    const changedFileCoverageEntrypoint = await readFile('scripts/test-coverage-changed.ts', 'utf8');
    const changedFileCoverageModule = await readFile('scripts/lib/coverage/changed-file-coverage.ts', 'utf8');
    const sharedChangedFilesModule = await readFile('scripts/lib/git/local-changed-files.ts', 'utf8');

    const baseline = JSON.parse(await readFile('tests/coverage-regression-baseline.json', 'utf8')) as {
      metrics?: Record<string, number>;
      minimumFloorPercentage?: number;
    };

    expect(scripts['test:coverage:collect']).toContain('run-vitest.ts run --coverage');
    expect(scripts['test:coverage:collect']).toContain('--coverage.reporter=json-summary');
    expect(scripts['test:coverage:regression']).toBe('bun --no-env-file ./scripts/check-coverage-regression.ts');
    expect(scripts['test:coverage:changed']).toBe('bun --no-env-file ./scripts/test-coverage-changed.ts');
    expect(scripts['test:coverage:update-baseline']).toBe('bun --no-env-file ./scripts/update-coverage-baseline.ts');
    expect(scripts.check).toContain('bun run test:coverage');
    expectCommandNotToRun(scripts.check, 'test:run');
    expect(scripts.check).not.toContain('test:coverage:update-baseline');
    expect(workflow).not.toContain('test:coverage:changed');
    expect(workflow).toContain('coverage:');
    expect(workflow).toContain('run: bun run check:hermetic-inputs && bun run test:coverage');
    expect(workflow).toContain('needs: [typecheck, lint, test, runtime-smoke, coverage, e2e-smoke, build]');
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
    const scripts = await readPackageScripts();
    const verificationContract = await readFile('docs/verification-contract.md', 'utf8');
    const vitestEntrypoint = await readFile('scripts/run-vitest.ts', 'utf8');
    const changedFileMutationEntrypoint = await readFile('scripts/test-mutation-changed.ts', 'utf8');
    const changedFileMutationModule = await readFile('scripts/lib/mutation/changed-file-mutation.ts', 'utf8');
    const sharedChangedFilesModule = await readFile('scripts/lib/git/local-changed-files.ts', 'utf8');

    expect(vitestEntrypoint).toContain('applyHermeticTestEnv()');
    expect(vitestEntrypoint).toContain('env: process.env');
    expect(scripts['test:mutation']).toBe('bun --no-env-file ./scripts/run-mutation.ts');
    expect(scripts['test:mutation:changed']).toBe('bun --no-env-file ./scripts/test-mutation-changed.ts');
    const mutationRunner = await readFile('scripts/run-mutation.ts', 'utf8');
    expect(mutationRunner).toContain('applyHermeticTestEnv()');
    expect(mutationRunner).toContain('prependNoEnvFile([\'x\', \'stryker\', \'run\'');
    expect(changedFileMutationEntrypoint).toContain('applyHermeticTestEnv()');
    const runtimeSmokeRunner = await readFile('scripts/run-runtime-smoke.ts', 'utf8');
    expect(runtimeSmokeRunner).toContain('tests/smoke/dev-auth-gate.test.ts');
    expect(runtimeSmokeRunner).toContain('runRequired(\'bun\', prependNoEnvFile([\'run\', \'build\']), runtimeSmokeEnv)');
    expect(runtimeSmokeRunner).toContain('tests/smoke/bun-auth-gate.test.ts');
    expect(scripts['design:lint']).toBe('bun --no-env-file x designmd lint DESIGN.md');
    expect(scripts.check).not.toContain('bun run test &&');
    expect(scripts.check).toContain('bun run typecheck && bun run test:coverage');
    expect(scripts.check).toContain('bun run test:coverage && bun run test:mutation:changed && bun run test:runtime:smoke');
    expect(scripts.check).not.toContain('bun run test:mutation &&');
    expect(scripts.check).not.toContain('test:smoke:');
    expect(workflow).not.toContain('mutation-changed:');
    expect(workflow).not.toContain('run: bun run test:mutation:changed');
    expect(workflow).toContain('needs: [typecheck, lint, test, runtime-smoke, coverage, e2e-smoke, build]');
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
    expect(verificationContract).toContain('bun run design:lint');
    expect(verificationContract).toContain('Changed-file mutation is intentionally local-only');
    expect(verificationContract).toContain('Test-facing Vitest, Stryker, and runtime smoke helpers set');
    expect(verificationContract).toContain('calibrated `thresholds.break: 70` floor');
  });

  test('keeps Bun version enforcement at install time instead of repeating a custom prefix across every verification script', async () => {
    const packageJson = await readFile('package.json', 'utf8');

    expect(packageJson).toContain('"preinstall": "bun --no-env-file ./scripts/verify-bun-version.ts"');
    expect(packageJson).not.toContain('./scripts/verify-bun-version.ts && eslint .');
    expect(packageJson).not.toContain('./scripts/verify-bun-version.ts && react-router typegen && tsc');
    expect(packageJson).not.toContain('./scripts/verify-bun-version.ts && bun --no-env-file ./scripts/run-vitest.ts');
    expect(packageJson).not.toContain('./scripts/verify-bun-version.ts && react-router build');
    expect(packageJson).not.toContain('./scripts/verify-bun-version.ts && bun --no-env-file ./scripts/run-playwright.ts');
  });

  test('keeps executable parity contracts on code and config surfaces only', async () => {
    const playwrightConfig = await readFile('playwright.config.ts', 'utf8');

    expect(playwrightConfig).toContain('detectPlaywrightRuntimeMode(process.argv)');
    expect(playwrightConfig).toContain('timezoneId: \'UTC\'');
    expect(playwrightConfig).toContain('locale: \'en-US\'');
    expect(playwrightConfig).toContain('bun --no-env-file run build && bun --no-env-file ./build/server/index.js');
    const playwrightRunner = await readFile('scripts/run-playwright.ts', 'utf8');
    expect(playwrightRunner).toContain('applyHermeticTestEnv()');
    expect(playwrightRunner).toContain('prependNoEnvFile([\'x\', \'playwright\', \'test\'');
    const worktreeDockerScript = await readFile('scripts/verify-ci-worktree-docker.sh', 'utf8');
    expect(worktreeDockerScript).toContain('bun run check:runtime');
    expect(worktreeDockerScript).not.toContain('verify:ci-faithful');
  });

  test('runs CI workflow jobs through the canonical package scripts', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    const dockerComposeWorkflow = await readFile('.github/workflows/docker-compose-smoke.yml', 'utf8');

    expect(workflow).toContain('run: bun run design:lint');
    expect(workflow).toContain('run: bun run lint');
    expect(workflow).toContain('run: bun run check:hermetic-inputs && bun run test');
    expect(workflow).toContain('runtime-smoke:');
    expect(workflow).toContain('run: bun run test:runtime:smoke');
    expect(workflow).not.toContain('bun-smoke:');
    expect(workflow).not.toContain('run: bun run test:smoke:');
    expect(workflow).toContain('run: bun run check:hermetic-inputs && bun run test:coverage');
    expect(workflow).toContain('run: bun run test:e2e:smoke');
    expect(workflow).toContain('uses: actions/upload-artifact@v5');
    expect(workflow).toContain('path: playwright-report/');
    expect(dockerComposeWorkflow).toContain('run: bun run check:docker-compose-smoke');
  });

  test('documents the canonical verification command surface', async () => {
    const verificationContract = await readFile('docs/verification-contract.md', 'utf8');
    const e2eGuide = await readFile('docs/E2E_TESTING_GUIDE.md', 'utf8');
    const browserQaContract = await readFile('docs/browser-qa-contract.md', 'utf8');
    const readme = await readFile('README.md', 'utf8');
    const agentGuidance = await readFile('AGENTS.md', 'utf8');

    for (const document of [verificationContract, e2eGuide, browserQaContract, readme, agentGuidance]) {
      expect(document).toContain('bun run test:e2e:smoke');
    }

    for (const document of [verificationContract, e2eGuide, readme, agentGuidance]) {
      expect(document).toContain('bun run check');
      expect(document).toContain('bun run check:fast');
    }

    expect(verificationContract).toContain('bun run check:runtime');
    expect(verificationContract).toContain('bun run check:docker-compose-smoke');
    expect(e2eGuide).toContain('bun run check:runtime');
    expect(readme).toContain('bun run check:runtime');
  });

  test('keeps package scripts thin and moves complex smoke logic into script files', async () => {
    const scripts = await readPackageScripts();
    const e2eSmokeRunner = await readFile('scripts/run-e2e-smoke.ts', 'utf8');
    const runtimeSmokeRunner = await readFile('scripts/run-runtime-smoke.ts', 'utf8');

    expect(scripts['test:e2e:smoke']).toBe('bun --no-env-file ./scripts/run-e2e-smoke.ts');
    expect(scripts['test:runtime:smoke']).toBe('bun --no-env-file ./scripts/run-runtime-smoke.ts');
    expect(scripts['backfill:browser-playback-fixtures']).not.toContain('--video-id');
    expect(scripts['test:e2e:smoke']).not.toContain('LOCAL_STREAMER_PLAYWRIGHT_INSTALL_DEPS');
    expect(scripts['test:e2e:smoke']).not.toContain('tests/e2e/');
    expect(scripts['test:runtime:smoke']).not.toContain('tests/smoke/');
    expect(e2eSmokeRunner).toContain('LOCAL_STREAMER_PLAYWRIGHT_INSTALL_DEPS');
    expect(e2eSmokeRunner).toContain('tests/e2e/anonymous-public-access.spec.ts');
    expect(e2eSmokeRunner).toContain('tests/e2e/product-shell-smoke.spec.ts');
    expect(runtimeSmokeRunner).toContain('createHermeticTestEnv');
    expect(runtimeSmokeRunner).toContain('prependNoEnvFile([\'run\', \'build\'])');
    const hermeticEnv = await readFile('scripts/hermetic-env.ts', 'utf8');
    expect(hermeticEnv).toContain('MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS');
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
