import { spawnSync } from 'node:child_process';
import {
  type BranchChangedFileOptions,
  type ChangedFileOptions,
  listLocalChangedFiles,
  listChangedFilesSinceBase as listSharedChangedFilesSinceBase,
  normalizeChangedPath,
} from '../git/local-changed-files';

const THRESHOLD_PERCENTAGE = 80;

interface BuildVitestArgsOptions {
  changedBase?: string;
  files: string[];
}

interface SpawnResult {
  status: number | null;
  error?: Error;
}

type SpawnCommand = (command: string, args: string[], options: { cwd: string }) => SpawnResult;
type OutputWriter = (message: string) => void;

interface RunChangedFileCoverageOptions {
  cwd?: string;
  spawn?: SpawnCommand;
  stdout?: OutputWriter;
  stderr?: OutputWriter;
}

export function isCoverageEligibleChangedProductionFile(path: string): boolean {
  const normalizedPath = normalizeChangedPath(path);

  if (!/^app\/.*\.(ts|tsx)$/.test(normalizedPath)) {
    return false;
  }

  if (/\.(test|spec)\.(ts|tsx)$/.test(normalizedPath)) {
    return false;
  }

  if (
    normalizedPath === 'app/entry.client.tsx' ||
    normalizedPath === 'app/entry.server.tsx' ||
    normalizedPath === 'app/routes.ts' ||
    normalizedPath === 'app/server.ts'
  ) {
    return false;
  }

  return !(
    normalizedPath.startsWith('app/shared/ui/') ||
    normalizedPath.startsWith('app/components/ui/')
  );
}

export function filterCoverageEligibleChangedProductionFiles(paths: string[]): string[] {
  const eligiblePaths = new Set<string>();

  for (const path of paths) {
    const normalizedPath = normalizeChangedPath(path);
    if (isCoverageEligibleChangedProductionFile(normalizedPath)) {
      eligiblePaths.add(normalizedPath);
    }
  }

  return [...eligiblePaths].sort();
}

export async function listCoverageEligibleChangedProductionFiles(options: ChangedFileOptions): Promise<string[]> {
  return filterCoverageEligibleChangedProductionFiles(
    await listLocalChangedFiles(options),
  );
}

export { listLocalChangedFiles };

export async function listChangedFilesSinceBase(options: BranchChangedFileOptions): Promise<string[]> {
  try {
    return await listSharedChangedFilesSinceBase(options);
  }
  catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message
        .replace('Unable to resolve changed base ref', 'Unable to resolve coverage changed base ref')
        .replace('Unable to resolve changed merge base', 'Unable to resolve coverage changed merge base')
        .replace('Unable to list changed files since base ref', 'Unable to list changed files since coverage changed base ref'));
    }

    throw error;
  }
}

export function buildChangedFileCoverageVitestArgs(options: BuildVitestArgsOptions): string[] {
  const changedArgs = options.changedBase
    ? ['--changed', options.changedBase]
    : ['--changed'];

  return [
    '--no-env-file',
    './scripts/run-vitest.ts',
    'run',
    ...changedArgs,
    '--coverage',
    '--coverage.reporter=text-summary',
    '--coverage.reporter=json-summary',
    `--coverage.thresholds.lines=${THRESHOLD_PERCENTAGE}`,
    `--coverage.thresholds.branches=${THRESHOLD_PERCENTAGE}`,
    `--coverage.thresholds.functions=${THRESHOLD_PERCENTAGE}`,
    `--coverage.thresholds.statements=${THRESHOLD_PERCENTAGE}`,
    ...options.files.map(file => `--coverage.include=${file}`),
  ];
}

function defaultSpawn(command: string, args: string[], options: { cwd: string }): SpawnResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: 'inherit',
  });

  return {
    error: result.error,
    status: result.status,
  };
}

export async function runChangedFileCoverage(
  options: RunChangedFileCoverageOptions = {},
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const spawn = options.spawn ?? defaultSpawn;
  const stdout = options.stdout ?? console.log;
  const files = await listCoverageEligibleChangedProductionFiles({ cwd });

  if (files.length === 0) {
    stdout('No changed production files require coverage validation.');
    return 0;
  }

  stdout([
    'Changed production files requiring coverage:',
    ...files.map(file => `- ${file}`),
    '',
    'Running changed-file coverage gate with Vitest...',
  ].join('\n'));

  const result = spawn('bun', buildChangedFileCoverageVitestArgs({
    files,
  }), { cwd });

  if (result.error) {
    throw result.error;
  }

  return typeof result.status === 'number' ? result.status : 1;
}
