import { spawnSync } from 'node:child_process';

interface GitCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export interface ChangedFileOptions {
  cwd: string;
}

export interface BranchChangedFileOptions extends ChangedFileOptions {
  baseRef: string;
}

export interface ChangedFileDiscovery {
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

export function normalizeChangedPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function parseGitPathList(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(normalizeChangedPath);
}

function resolveGitBase(cwd: string, baseRef: string): string {
  const refResult = runGit(cwd, ['rev-parse', '--verify', `${baseRef}^{commit}`]);
  assertGitSuccess(
    refResult,
    `Unable to resolve changed base ref: ${baseRef}`,
  );

  const mergeBaseResult = runGit(cwd, ['merge-base', 'HEAD', baseRef]);
  assertGitSuccess(
    mergeBaseResult,
    `Unable to resolve changed merge base: ${baseRef}`,
  );

  return mergeBaseResult.stdout.trim();
}

export async function discoverLocalChangedFiles(options: ChangedFileOptions): Promise<ChangedFileDiscovery> {
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

export async function discoverChangedFilesSinceBase(options: BranchChangedFileOptions): Promise<ChangedFileDiscovery> {
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
    `Unable to list changed files since base ref: ${options.baseRef}`,
  );

  return {
    changedBase,
    files: parseGitPathList(diffResult.stdout),
  };
}

export async function listChangedFilesSinceBase(options: BranchChangedFileOptions): Promise<string[]> {
  const discovery = await discoverChangedFilesSinceBase(options);
  return discovery.files.sort();
}
