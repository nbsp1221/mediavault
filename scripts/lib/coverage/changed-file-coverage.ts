import { spawnSync } from 'node:child_process';

const THRESHOLD_PERCENTAGE = 80;

interface GitCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

interface ChangedFileOptions {
  cwd: string;
}

interface BranchChangedFileOptions extends ChangedFileOptions {
  baseRef: string;
}

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

interface ChangedFileDiscovery {
  changedBase?: string;
  files: string[];
}

function runGit(cwd: string, args: string[]): GitCommandResult {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  });

  return {
    error: result.error,
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

function assertGitSuccess(result: GitCommandResult, message: string): void {
  if (result.status !== 0 || result.error) {
    throw new Error(message);
  }
}

function normalizeChangedPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
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

function resolveGitBase(cwd: string, baseRef: string): string {
  const refResult = runGit(cwd, ['rev-parse', '--verify', `${baseRef}^{commit}`]);
  assertGitSuccess(
    refResult,
    `Unable to resolve coverage changed base ref: ${baseRef}`,
  );

  const mergeBaseResult = runGit(cwd, ['merge-base', 'HEAD', baseRef]);
  assertGitSuccess(
    mergeBaseResult,
    `Unable to resolve coverage changed merge base: ${baseRef}`,
  );

  return mergeBaseResult.stdout.trim();
}

async function discoverChangedFilesSinceBase(options: BranchChangedFileOptions): Promise<ChangedFileDiscovery> {
  const changedBase = resolveGitBase(options.cwd, options.baseRef);
  const diffResult = runGit(options.cwd, [
    'diff',
    '--name-only',
    '--diff-filter=ACMRT',
    `${changedBase}...HEAD`,
    '--',
  ]);

  assertGitSuccess(
    diffResult,
    `Unable to list changed files since coverage changed base ref: ${options.baseRef}`,
  );

  return {
    changedBase,
    files: diffResult.stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(normalizeChangedPath),
  };
}

function parseGitPathList(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(normalizeChangedPath);
}

async function discoverLocalChangedFiles(options: ChangedFileOptions): Promise<ChangedFileDiscovery> {
  const trackedResult = runGit(options.cwd, [
    'diff',
    '--name-only',
    '--diff-filter=ACMRT',
    'HEAD',
    '--',
  ]);

  assertGitSuccess(
    trackedResult,
    'Unable to list local changed files relative to HEAD',
  );

  const untrackedResult = runGit(options.cwd, [
    'ls-files',
    '--others',
    '--exclude-standard',
  ]);

  assertGitSuccess(
    untrackedResult,
    'Unable to list untracked local files',
  );

  return {
    files: [...new Set([
      ...parseGitPathList(trackedResult.stdout),
      ...parseGitPathList(untrackedResult.stdout),
    ])].sort(),
  };
}

export async function listLocalChangedFiles(options: ChangedFileOptions): Promise<string[]> {
  const discovery = await discoverLocalChangedFiles(options);
  return discovery.files;
}

export async function listChangedFilesSinceBase(options: BranchChangedFileOptions): Promise<string[]> {
  const discovery = await discoverChangedFilesSinceBase(options);
  return discovery.files.sort();
}

export async function listCoverageEligibleChangedProductionFiles(options: ChangedFileOptions): Promise<string[]> {
  return filterCoverageEligibleChangedProductionFiles(
    await listLocalChangedFiles(options),
  );
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
  const discovery = await discoverLocalChangedFiles({ cwd });
  const files = filterCoverageEligibleChangedProductionFiles(discovery.files);

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
