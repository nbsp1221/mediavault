import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  type CoverageRegressionBaseline,
  checkCoverageRegression,
} from '../../../scripts/check-coverage-regression';
import { updateCoverageBaseline } from '../../../scripts/update-coverage-baseline';

const cleanupPaths: string[] = [];
const checkScriptPath = resolve('scripts/check-coverage-regression.ts');
const updateScriptPath = resolve('scripts/update-coverage-baseline.ts');

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map(path => rm(path, { force: true, recursive: true })));
});

async function createRoot(): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'coverage-regression-'));
  cleanupPaths.push(rootDir);
  await mkdir(join(rootDir, 'coverage'), { recursive: true });
  await mkdir(join(rootDir, 'tests'), { recursive: true });
  return rootDir;
}

function createBaseline(overrides: Partial<CoverageRegressionBaseline> = {}): CoverageRegressionBaseline {
  return {
    schemaVersion: 1,
    source: 'Vitest coverage-summary.json total metrics',
    scope: 'calibrated app/**/*.{ts,tsx} coverage configured in vite.config.ts',
    lastReviewed: '2026-05-14',
    tolerancePercentagePoints: 0.25,
    metrics: {
      lines: 84.73,
      branches: 80.17,
      functions: 87.16,
      statements: 84.73,
    },
    ...overrides,
  };
}

async function writeBaseline(rootDir: string, baseline = createBaseline()): Promise<void> {
  await writeFile(
    join(rootDir, 'tests', 'coverage-regression-baseline.json'),
    `${JSON.stringify(baseline, null, 2)}\n`,
  );
}

async function writeCoverageSummary(rootDir: string, metrics: Record<string, number>): Promise<void> {
  await writeFile(
    join(rootDir, 'coverage', 'coverage-summary.json'),
    `${JSON.stringify({
      total: {
        lines: { pct: metrics.lines },
        branches: { pct: metrics.branches },
        functions: { pct: metrics.functions },
        statements: { pct: metrics.statements },
      },
    }, null, 2)}\n`,
  );
}

describe('coverage regression policy', () => {
  test('passes when all current metrics are at or above baseline minus tolerance', async () => {
    const rootDir = await createRoot();
    await writeBaseline(rootDir);
    await writeCoverageSummary(rootDir, {
      lines: 84.48,
      branches: 80.00,
      functions: 86.91,
      statements: 84.48,
    });

    const result = await checkCoverageRegression({ rootDir });

    expect(result.ok).toBe(true);
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        baseline: 84.73,
        current: 84.48,
        minimum: 84.48,
        name: 'lines',
        ok: true,
        tolerance: 0.25,
      }),
    ]));
  });

  test('fails when a metric drops below baseline minus tolerance', async () => {
    const rootDir = await createRoot();
    await writeBaseline(rootDir);
    await writeCoverageSummary(rootDir, {
      lines: 84.47,
      branches: 80.17,
      functions: 87.16,
      statements: 84.73,
    });

    const result = await checkCoverageRegression({ rootDir });

    expect(result.ok).toBe(false);
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'lines',
        ok: false,
      }),
    ]));
  });

  test('fails when coverage summary output is missing', async () => {
    const rootDir = await createRoot();
    await writeBaseline(rootDir);

    await expect(checkCoverageRegression({ rootDir })).rejects.toThrow(
      'Missing coverage summary',
    );
  });

  test('fails when the baseline is malformed', async () => {
    const rootDir = await createRoot();
    await writeFile(join(rootDir, 'tests', 'coverage-regression-baseline.json'), '{"schemaVersion":1}\n');
    await writeCoverageSummary(rootDir, {
      lines: 84.73,
      branches: 80.17,
      functions: 87.16,
      statements: 84.73,
    });

    await expect(checkCoverageRegression({ rootDir })).rejects.toThrow(
      'Invalid coverage regression baseline',
    );
  });

  test('does not read, duplicate, or enforce the 80% absolute floor', async () => {
    const rootDir = await createRoot();
    await writeBaseline(rootDir, createBaseline({
      metrics: {
        lines: 79,
        branches: 79,
        functions: 79,
        statements: 79,
      },
    }));
    await writeCoverageSummary(rootDir, {
      lines: 78.75,
      branches: 78.75,
      functions: 78.75,
      statements: 78.75,
    });

    const result = await checkCoverageRegression({ rootDir });

    expect(result.ok).toBe(true);
  });

  test('CLI prints pass output and exits zero when regression policy passes', async () => {
    const rootDir = await createRoot();
    await writeBaseline(rootDir);
    await writeCoverageSummary(rootDir, {
      lines: 84.73,
      branches: 80.17,
      functions: 87.16,
      statements: 84.73,
    });

    const result = spawnSync('bun', ['--no-env-file', checkScriptPath], {
      cwd: rootDir,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Coverage regression gate passed.');
    expect(result.stdout).toContain('lines');
    expect(result.stderr).toBe('');
  });

  test('CLI prints fail output and exits non-zero when regression policy fails', async () => {
    const rootDir = await createRoot();
    await writeBaseline(rootDir);
    await writeCoverageSummary(rootDir, {
      lines: 84.47,
      branches: 80.17,
      functions: 87.16,
      statements: 84.73,
    });

    const result = spawnSync('bun', ['--no-env-file', checkScriptPath], {
      cwd: rootDir,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Coverage regression gate failed.');
    expect(result.stderr).toContain('lines');
  });
});

describe('coverage baseline update policy', () => {
  test('ratchets improved metrics upward and preserves non-policy metadata', async () => {
    const rootDir = await createRoot();
    await writeBaseline(rootDir);
    await writeCoverageSummary(rootDir, {
      lines: 85.01,
      branches: 80.17,
      functions: 87.00,
      statements: 84.73,
    });

    const result = await updateCoverageBaseline({
      currentDate: '2026-05-15',
      rootDir,
    });
    const updated = JSON.parse(await readFile(join(rootDir, 'tests', 'coverage-regression-baseline.json'), 'utf8')) as CoverageRegressionBaseline;

    expect(result.updatedMetrics).toEqual(['lines']);
    expect(updated).toMatchObject({
      schemaVersion: 1,
      source: 'Vitest coverage-summary.json total metrics',
      scope: 'calibrated app/**/*.{ts,tsx} coverage configured in vite.config.ts',
      lastReviewed: '2026-05-15',
      tolerancePercentagePoints: 0.25,
      metrics: {
        lines: 85.01,
        branches: 80.17,
        functions: 87.16,
        statements: 84.73,
      },
    });
  });

  test('leaves the baseline unchanged when no metric improves', async () => {
    const rootDir = await createRoot();
    const baseline = createBaseline();
    await writeBaseline(rootDir, baseline);
    await writeCoverageSummary(rootDir, {
      lines: 84.50,
      branches: 80.17,
      functions: 87.16,
      statements: 84.70,
    });

    const result = await updateCoverageBaseline({
      currentDate: '2026-05-15',
      rootDir,
    });
    const updated = JSON.parse(await readFile(join(rootDir, 'tests', 'coverage-regression-baseline.json'), 'utf8')) as CoverageRegressionBaseline;

    expect(result.updatedMetrics).toEqual([]);
    expect(updated).toEqual(baseline);
  });

  test('CLI updates the baseline file only through the explicit update command', async () => {
    const rootDir = await createRoot();
    await writeBaseline(rootDir);
    await writeCoverageSummary(rootDir, {
      lines: 84.74,
      branches: 80.17,
      functions: 87.16,
      statements: 84.73,
    });

    const result = spawnSync('bun', ['--no-env-file', updateScriptPath], {
      cwd: rootDir,
      encoding: 'utf8',
    });
    const updated = JSON.parse(await readFile(join(rootDir, 'tests', 'coverage-regression-baseline.json'), 'utf8')) as CoverageRegressionBaseline;

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Coverage regression baseline updated.');
    expect(updated.metrics.lines).toBe(84.74);
    expect(updated.metrics.branches).toBe(80.17);
  });
});
