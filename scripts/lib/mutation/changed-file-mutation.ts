import { spawnSync } from 'node:child_process';
import {
  type ChangedFileOptions,
  listLocalChangedFiles,
  normalizeChangedPath,
} from '../git/local-changed-files';

interface SpawnResult {
  status: number | null;
  error?: Error;
}

type SpawnCommand = (command: string, args: string[], options: { cwd: string }) => SpawnResult;
type OutputWriter = (message: string) => void;

export interface BuildChangedFileMutationArgsOptions {
  files: string[];
}

export interface RunChangedFileMutationOptions {
  cwd?: string;
  spawn?: SpawnCommand;
  stdout?: OutputWriter;
  stderr?: OutputWriter;
}

export function isMutationEligibleChangedProductionFile(path: string): boolean {
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

export function filterMutationEligibleChangedProductionFiles(paths: string[]): string[] {
  const eligiblePaths = new Set<string>();

  for (const path of paths) {
    const normalizedPath = normalizeChangedPath(path);
    if (isMutationEligibleChangedProductionFile(normalizedPath)) {
      eligiblePaths.add(normalizedPath);
    }
  }

  return [...eligiblePaths].sort();
}

export async function listMutationEligibleChangedProductionFiles(options: ChangedFileOptions): Promise<string[]> {
  return filterMutationEligibleChangedProductionFiles(
    await listLocalChangedFiles(options),
  );
}

export function buildChangedFileMutationStrykerArgs(options: BuildChangedFileMutationArgsOptions): string[] {
  return [
    '--no-env-file',
    'x',
    'stryker',
    'run',
    'scripts/config/stryker.changed.config.mjs',
    '--mutate',
    options.files.join(','),
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

export async function runChangedFileMutation(
  options: RunChangedFileMutationOptions = {},
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const spawn = options.spawn ?? defaultSpawn;
  const stdout = options.stdout ?? console.log;
  const files = await listMutationEligibleChangedProductionFiles({ cwd });

  if (files.length === 0) {
    stdout('No changed production files require mutation validation.');
    return 0;
  }

  stdout([
    'Changed production files requiring mutation validation:',
    ...files.map(file => `- ${file}`),
    '',
    'Running changed-file mutation gate with Stryker...',
  ].join('\n'));

  const result = spawn('bun', buildChangedFileMutationStrykerArgs({
    files,
  }), { cwd });

  if (result.error) {
    return 1;
  }

  return typeof result.status === 'number' ? result.status : 1;
}
