import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type CoverageRegressionBaseline,
  readCoverageRegressionBaseline,
  readCoverageSummaryMetrics,
} from './check-coverage-regression';

const METRIC_NAMES = ['lines', 'branches', 'functions', 'statements'] as const;
const BASELINE_PATH = 'tests/coverage-regression-baseline.json';

interface UpdateCoverageBaselineOptions {
  currentDate?: string;
  rootDir?: string;
}

export interface UpdateCoverageBaselineResult {
  baseline: CoverageRegressionBaseline;
  updatedMetrics: string[];
  unchangedMetrics: string[];
}

function getCurrentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function roundCoverageMetric(value: number): number {
  return Number(value.toFixed(2));
}

export async function updateCoverageBaseline(
  options: UpdateCoverageBaselineOptions = {},
): Promise<UpdateCoverageBaselineResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const baseline = await readCoverageRegressionBaseline(rootDir);
  const currentMetrics = await readCoverageSummaryMetrics(rootDir);
  const updatedMetrics: string[] = [];
  const unchangedMetrics: string[] = [];
  const nextBaseline: CoverageRegressionBaseline = {
    ...baseline,
    metrics: {
      ...baseline.metrics,
    },
  };

  for (const metricName of METRIC_NAMES) {
    const currentMetric = roundCoverageMetric(currentMetrics[metricName]);
    if (currentMetric > baseline.metrics[metricName]) {
      nextBaseline.metrics[metricName] = currentMetric;
      updatedMetrics.push(metricName);
    }
    else {
      unchangedMetrics.push(metricName);
    }
  }

  if (updatedMetrics.length > 0) {
    nextBaseline.lastReviewed = options.currentDate ?? getCurrentDate();
    await writeFile(
      resolve(rootDir, BASELINE_PATH),
      `${JSON.stringify(nextBaseline, null, 2)}\n`,
    );
  }

  return {
    baseline: nextBaseline,
    updatedMetrics,
    unchangedMetrics,
  };
}

function formatUpdateResult(result: UpdateCoverageBaselineResult): string {
  if (result.updatedMetrics.length === 0) {
    return 'Coverage regression baseline is already up to date.';
  }

  return [
    'Coverage regression baseline updated.',
    `Updated: ${result.updatedMetrics.join(', ')}`,
    `Unchanged: ${result.unchangedMetrics.join(', ') || 'none'}`,
  ].join('\n');
}

if (import.meta.main) {
  try {
    const result = await updateCoverageBaseline();
    console.log(formatUpdateResult(result));
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
