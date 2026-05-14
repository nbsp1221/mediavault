import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const METRIC_NAMES = ['lines', 'branches', 'functions', 'statements'] as const;
const BASELINE_PATH = 'tests/coverage-regression-baseline.json';

type CoverageMetricName = typeof METRIC_NAMES[number];

type CoverageMetrics = Record<CoverageMetricName, number>;

export interface CoverageRegressionBaseline {
  schemaVersion: 1;
  source: string;
  scope: string;
  lastReviewed: string;
  tolerancePercentagePoints: number;
  metrics: CoverageMetrics;
}

export interface CoverageRegressionRow {
  name: CoverageMetricName;
  current: number;
  baseline: number;
  tolerance: number;
  minimum: number;
  ok: boolean;
}

export interface CoverageRegressionResult {
  ok: boolean;
  rows: CoverageRegressionRow[];
}

interface CoverageRegressionOptions {
  rootDir?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonFile(filePath: string, missingMessage: string): Promise<unknown> {
  let source: string;

  try {
    source = await readFile(filePath, 'utf8');
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(missingMessage);
    }
    throw error;
  }

  return JSON.parse(source);
}

function assertMetricNumber(value: unknown, message: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(message);
  }
}

export function parseCoverageRegressionBaseline(value: unknown): CoverageRegressionBaseline {
  if (!isObject(value)) {
    throw new Error('Invalid coverage regression baseline: expected an object.');
  }

  if (value.schemaVersion !== 1) {
    throw new Error('Invalid coverage regression baseline: schemaVersion must be 1.');
  }

  if (typeof value.source !== 'string' || typeof value.scope !== 'string' || typeof value.lastReviewed !== 'string') {
    throw new Error('Invalid coverage regression baseline: metadata fields must be strings.');
  }

  assertMetricNumber(
    value.tolerancePercentagePoints,
    'Invalid coverage regression baseline: tolerancePercentagePoints must be a number.',
  );

  if (!isObject(value.metrics)) {
    throw new Error('Invalid coverage regression baseline: metrics must be an object.');
  }

  const metrics = {} as CoverageMetrics;
  for (const metricName of METRIC_NAMES) {
    const metricValue = value.metrics[metricName];
    assertMetricNumber(
      metricValue,
      `Invalid coverage regression baseline: metrics.${metricName} must be a number.`,
    );
    metrics[metricName] = metricValue;
  }

  return {
    schemaVersion: 1,
    source: value.source,
    scope: value.scope,
    lastReviewed: value.lastReviewed,
    tolerancePercentagePoints: value.tolerancePercentagePoints,
    metrics,
  };
}

function parseCoverageSummary(value: unknown): CoverageMetrics {
  if (!isObject(value) || !isObject(value.total)) {
    throw new Error('Invalid coverage summary: total metrics are missing.');
  }

  const metrics = {} as CoverageMetrics;
  for (const metricName of METRIC_NAMES) {
    const metric = value.total[metricName];
    if (!isObject(metric)) {
      throw new Error(`Invalid coverage summary: total.${metricName} is missing.`);
    }
    assertMetricNumber(
      metric.pct,
      `Invalid coverage summary: total.${metricName}.pct must be a number.`,
    );
    metrics[metricName] = metric.pct;
  }

  return metrics;
}

export async function readCoverageRegressionBaseline(rootDir = process.cwd()): Promise<CoverageRegressionBaseline> {
  const baselinePath = resolve(rootDir, BASELINE_PATH);
  return parseCoverageRegressionBaseline(await readJsonFile(
    baselinePath,
    `Missing coverage regression baseline: ${BASELINE_PATH}`,
  ));
}

export async function readCoverageSummaryMetrics(rootDir = process.cwd()): Promise<CoverageMetrics> {
  const summaryPath = resolve(rootDir, 'coverage', 'coverage-summary.json');
  return parseCoverageSummary(await readJsonFile(
    summaryPath,
    'Missing coverage summary: coverage/coverage-summary.json',
  ));
}

export async function checkCoverageRegression(
  options: CoverageRegressionOptions = {},
): Promise<CoverageRegressionResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const baseline = await readCoverageRegressionBaseline(rootDir);
  const currentMetrics = await readCoverageSummaryMetrics(rootDir);

  const rows = METRIC_NAMES.map((name): CoverageRegressionRow => {
    const baselineMetric = baseline.metrics[name];
    const minimum = Number((baselineMetric - baseline.tolerancePercentagePoints).toFixed(2));
    const current = currentMetrics[name];

    return {
      name,
      current,
      baseline: baselineMetric,
      tolerance: baseline.tolerancePercentagePoints,
      minimum,
      ok: current >= minimum,
    };
  });

  return {
    ok: rows.every(row => row.ok),
    rows,
  };
}

function formatRow(row: CoverageRegressionRow): string {
  const status = row.ok ? 'PASS' : 'FAIL';
  return [
    row.name.padEnd(10),
    status.padEnd(4),
    `current=${row.current.toFixed(2)}`,
    `baseline=${row.baseline.toFixed(2)}`,
    `tolerance=${row.tolerance.toFixed(2)}`,
    `minimum=${row.minimum.toFixed(2)}`,
  ].join('  ');
}

export function formatCoverageRegressionResult(result: CoverageRegressionResult): string {
  const title = result.ok
    ? 'Coverage regression gate passed.'
    : 'Coverage regression gate failed.';

  return [
    title,
    ...result.rows.map(formatRow),
  ].join('\n');
}

if (import.meta.main) {
  try {
    const result = await checkCoverageRegression();
    const output = formatCoverageRegressionResult(result);
    if (result.ok) {
      console.log(output);
    }
    else {
      console.error(output);
      process.exit(1);
    }
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
