import { readFile } from 'node:fs/promises';
import type { ViteUserConfig } from 'vitest/config';
import { loadConfigFromFile } from 'vite';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { buildChangedFileCoverageVitestArgs } from '../../../scripts/lib/coverage/changed-file-coverage';

const packageContractSchema = z.object({
  engines: z.object({ node: z.string() }),
  packageManager: z.string(),
  scripts: z.record(z.string(), z.string()),
  devDependencies: z.record(z.string(), z.string()),
});

async function readPackageContract(): Promise<z.infer<typeof packageContractSchema>> {
  return packageContractSchema.parse(JSON.parse(await readFile('package.json', 'utf8')));
}

function steps(command: string): string[] {
  return command.split(/\s*&&\s*/);
}

describe('verification command surface contract', () => {
  test('runs the required base gates once and escalates runtime checks separately', async () => {
    const { scripts } = await readPackageContract();
    expect(steps(scripts.check)).toEqual([
      'pnpm check:hermetic-inputs',
      'pnpm design:lint',
      'pnpm format:check',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test:coverage',
      'pnpm test:runtime:smoke',
    ]);
    expect(steps(scripts['check:runtime'])).toEqual([
      'pnpm check',
      'pnpm test:e2e:smoke',
      'pnpm check:docker-compose-smoke',
    ]);
    expect(steps(scripts['check:fast'])).toEqual([
      'pnpm check:hermetic-inputs',
      'pnpm design:lint',
      'pnpm format:check',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test',
    ]);
    expect(steps(scripts.build)).toEqual([
      'react-router build',
      'tsx ./scripts/check-client-boundary.ts',
    ]);
    expect(scripts.check).not.toContain('update-baseline');
  });

  test('uses the maintained shared Oxlint, ESLint, and Oxfmt policies', async () => {
    const { scripts, devDependencies } = await readPackageContract();
    expect(steps(scripts.lint)).toEqual(['pnpm lint:oxlint', 'pnpm lint:eslint']);
    expect(scripts['lint:oxlint']).toBe('oxlint .');
    expect(scripts['lint:eslint']).toBe('eslint .');
    expect(scripts['format:check']).toBe('oxfmt --check .');
    for (const name of [
      '@retn0/eslint-config',
      '@retn0/eslint-config-oxlint',
      '@retn0/oxlint-config',
      '@retn0/oxfmt-config',
    ]) {
      expect(devDependencies[name]).toEqual(expect.any(String));
    }
    const [eslint, oxlint, formatter] = await Promise.all([
      readFile('eslint.config.js', 'utf8'),
      readFile('oxlint.config.mts', 'utf8'),
      readFile('oxfmt.config.mts', 'utf8'),
    ]);
    expect(eslint).toContain('eslintConfigOxlint(oxlintConfig)');
    expect(oxlint).toContain("from '@retn0/oxlint-config'");
    expect(formatter).toContain("from '@retn0/oxfmt-config'");
  });

  test('keeps coverage collection, regression, and changed-file validation mandatory', async () => {
    const { scripts } = await readPackageContract();
    expect(steps(scripts['test:coverage'])).toEqual([
      'pnpm test:coverage:collect',
      'pnpm test:coverage:regression',
      'pnpm test:coverage:changed',
    ]);
    expect(scripts['test:coverage:collect']).toContain('run-vitest.ts run --coverage');
    expect(scripts['test:coverage:collect']).toContain('--coverage.reporter=json-summary');

    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, 'vite.config.ts');
    const config: ViteUserConfig | undefined = loaded?.config;
    expect(config?.test?.coverage).toEqual(
      expect.objectContaining({
        provider: 'v8',
        include: ['app/**/*.{ts,tsx}'],
        thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
      }),
    );
    const projects = z
      .array(
        z.object({
          test: z.object({ name: z.string(), environment: z.string() }),
        }),
      )
      .parse(config?.test?.projects);
    expect(projects.map(({ test: project }) => `${project.name}:${project.environment}`)).toEqual(
      expect.arrayContaining(['modules:node', 'integration:node', 'ui:jsdom']),
    );

    const baseline = z
      .object({
        tolerancePercentagePoints: z.number(),
        metrics: z.record(z.string(), z.number()),
      })
      .parse(JSON.parse(await readFile('tests/coverage-regression-baseline.json', 'utf8')));
    expect(baseline.tolerancePercentagePoints).toBe(0.25);
    for (const metric of ['lines', 'branches', 'functions', 'statements']) {
      expect(baseline.metrics[metric]).toBeGreaterThanOrEqual(80);
    }

    const args = buildChangedFileCoverageVitestArgs({
      files: ['app/modules/library/domain/video-tag.ts'],
    });
    for (const metric of ['lines', 'branches', 'functions', 'statements']) {
      expect(args).toContain(`--coverage.thresholds.${metric}=80`);
    }
    expect(args).toContain('--coverage.include=app/modules/library/domain/video-tag.ts');
  });

  test('isolates test entrypoints from dotenv loading and ambient runtime data', async () => {
    const { scripts } = await readPackageContract();
    expect(scripts.typecheck).toContain('MEDIAVAULT_DISABLE_VITE_ENV_FILES=true');
    for (const script of [
      'test',
      'test:modules',
      'test:integration',
      'test:ui-dom',
      'test:coverage:collect',
    ]) {
      expect(scripts[script]).toContain('tsx ./scripts/run-vitest.ts');
    }
    for (const runner of ['run-vitest', 'run-playwright']) {
      const source = await readFile(`scripts/${runner}.ts`, 'utf8');
      expect(source).toContain('applyHermeticTestEnv()');
      expect(source).not.toContain('dotenv');
    }
    const runtime = await readFile('scripts/run-runtime-smoke.ts', 'utf8');
    expect(runtime).toContain('createHermeticTestEnv()');
    const devIndex = runtime.indexOf('tests/smoke/dev-auth-gate.test.ts');
    const buildIndex = runtime.indexOf("runRequired(['build'])");
    const productionIndex = runtime.indexOf('tests/smoke/node-auth-gate.test.ts');
    expect(devIndex).toBeGreaterThan(0);
    expect(buildIndex).toBeGreaterThan(devIndex);
    expect(productionIndex).toBeGreaterThan(buildIndex);
    const e2e = await readFile('playwright.config.ts', 'utf8');
    expect(e2e).toContain('createRuntimeTestWorkspace()');
    expect(e2e).toContain("timezoneId: 'UTC'");
    expect(e2e).toContain("locale: 'en-US'");
    expect(e2e).toContain('reuseExistingServer: false');
  });

  test('aligns local, CI, and production runtime versions and mandatory CI gates', async () => {
    const contract = await readPackageContract();
    const [workflow, composeWorkflow, dockerfile] = await Promise.all([
      readFile('.github/workflows/ci.yml', 'utf8'),
      readFile('.github/workflows/docker-compose-smoke.yml', 'utf8'),
      readFile('Dockerfile', 'utf8'),
    ]);
    for (const config of [workflow, composeWorkflow]) {
      expect(config).toContain('node-version-file: .node-version');
      expect(config).toContain('pnpm/action-setup@');
      expect(config).toContain('pnpm install --frozen-lockfile');
      expect(config).not.toContain('setup-bun');
    }
    expect(dockerfile).toContain(`node:${contract.engines.node}-bookworm-slim`);
    expect(dockerfile).toContain(contract.packageManager);
    expect(dockerfile).toContain('pnpm install --frozen-lockfile');
    expect(dockerfile).toContain('USER node');
    expect(dockerfile).toContain('server.mjs');
    for (const command of [
      'typecheck',
      'design:lint',
      'format:check',
      'lint',
      'test:runtime:smoke',
      'test:e2e:smoke',
      'build',
    ]) {
      expect(workflow).toContain(`run: pnpm ${command}`);
    }
    expect(workflow).toContain('pnpm check:hermetic-inputs && pnpm test:coverage');
    expect(workflow).toContain(
      'needs: [typecheck, lint, test, runtime-smoke, coverage, e2e-smoke, build]',
    );
    expect(composeWorkflow).toContain('pnpm check:docker-compose-smoke');
  });
});
