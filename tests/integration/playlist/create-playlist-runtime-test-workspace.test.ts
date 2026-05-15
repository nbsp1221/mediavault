import { afterEach, describe, expect, test } from 'vitest';
import { createPlaylistRuntimeTestWorkspace } from '../../support/create-playlist-runtime-test-workspace';

const ENV_KEYS = [
  'DATABASE_SQLITE_PATH',
  'STORAGE_DIR',
  'VIDEO_JWT_SECRET',
  'VIDEO_MASTER_ENCRYPTION_SEED',
] as const;

const originalEnv = ENV_KEYS.reduce<Record<typeof ENV_KEYS[number], string | undefined>>((values, key) => {
  values[key] = process.env[key];
  return values;
}, {} as Record<typeof ENV_KEYS[number], string | undefined>);

function restoreOriginalEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

describe('createPlaylistRuntimeTestWorkspace', () => {
  afterEach(() => {
    restoreOriginalEnv();
  });

  test('restores previous env values during cleanup', async () => {
    process.env.DATABASE_SQLITE_PATH = '/tmp/previous-db.sqlite';
    process.env.STORAGE_DIR = '/tmp/previous-storage';
    process.env.VIDEO_JWT_SECRET = 'previous-jwt-secret';
    process.env.VIDEO_MASTER_ENCRYPTION_SEED = 'previous-master-seed';

    const workspace = await createPlaylistRuntimeTestWorkspace();

    expect(process.env.DATABASE_SQLITE_PATH).toBe(workspace.databasePath);
    expect(process.env.STORAGE_DIR).toBe(workspace.storageDir);
    expect(process.env.VIDEO_JWT_SECRET).toBeUndefined();
    expect(process.env.VIDEO_MASTER_ENCRYPTION_SEED).toBeUndefined();

    await workspace.cleanup();

    expect(process.env.DATABASE_SQLITE_PATH).toBe('/tmp/previous-db.sqlite');
    expect(process.env.STORAGE_DIR).toBe('/tmp/previous-storage');
    expect(process.env.VIDEO_JWT_SECRET).toBe('previous-jwt-secret');
    expect(process.env.VIDEO_MASTER_ENCRYPTION_SEED).toBe('previous-master-seed');
  });
});
