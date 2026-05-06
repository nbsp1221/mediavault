import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StorageProbeResult } from '../application/production-readiness.policy';

export const DATABASE_READY_SENTINEL = '.local-streamer-db-ready';
export const DEFAULT_STORAGE_PROBE_TIMEOUT_MS = 2_000;
export const STORAGE_READY_SENTINEL = '.local-streamer-storage-ready';

export interface RuntimeStorageProbeConfig {
  databasePath: string;
  storageDir: string;
}

interface ProbeOptions {
  timeoutMs?: number;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  }
  finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function getErrorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function probeWritableDirectory(
  directory: string,
  sentinelName: string,
): Promise<void> {
  await mkdir(directory, { recursive: true });

  const sentinelPath = path.join(directory, sentinelName);
  try {
    const content = `local-streamer-readiness:${randomUUID()}`;
    await writeFile(sentinelPath, content, { encoding: 'utf8' });
    await readFile(sentinelPath, { encoding: 'utf8' });
  }
  finally {
    await rm(sentinelPath, { force: true });
  }
}

async function probeWritableDatabasePath(databasePath: string): Promise<void> {
  await probeWritableDirectory(path.dirname(databasePath), DATABASE_READY_SENTINEL);

  try {
    const databaseStat = await stat(databasePath);
    if (!databaseStat.isFile()) {
      throw new Error('database path is not a regular file');
    }

    const handle = await open(databasePath, 'r+');
    await handle.close();
  }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

export async function probeStorageRootWritable(
  storageDir: string,
  options: ProbeOptions = {},
): Promise<StorageProbeResult> {
  try {
    await withTimeout(
      probeWritableDirectory(storageDir, STORAGE_READY_SENTINEL),
      options.timeoutMs ?? DEFAULT_STORAGE_PROBE_TIMEOUT_MS,
      'storage root probe timed out',
    );

    return { ok: true, target: 'storage-root' };
  }
  catch (error) {
    return {
      ok: false,
      reason: getErrorReason(error),
      target: 'storage-root',
    };
  }
}

export async function probeDatabasePathWritable(
  databasePath: string,
  options: ProbeOptions = {},
): Promise<StorageProbeResult> {
  try {
    await withTimeout(
      probeWritableDatabasePath(databasePath),
      options.timeoutMs ?? DEFAULT_STORAGE_PROBE_TIMEOUT_MS,
      'database path probe timed out',
    );

    return { ok: true, target: 'database-path' };
  }
  catch (error) {
    return {
      ok: false,
      reason: getErrorReason(error),
      target: 'database-path',
    };
  }
}

export async function probeConfiguredStorage(
  config: RuntimeStorageProbeConfig,
  options: ProbeOptions = {},
): Promise<StorageProbeResult[]> {
  return Promise.all([
    probeStorageRootWritable(config.storageDir, options),
    probeDatabasePathWritable(config.databasePath, options),
  ]);
}
