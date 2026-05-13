import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const ORIGINAL_STORAGE_DIR = process.env.STORAGE_DIR;
const ORIGINAL_DATABASE_SQLITE_PATH = process.env.DATABASE_SQLITE_PATH;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const workspaces: string[] = [];

function createWorkspacePath(name: string) {
  const workspace = mkdtempSync(path.join(tmpdir(), `local-streamer-${name}-`));
  workspaces.push(workspace);
  return workspace;
}

function clearPathEnv() {
  delete process.env.DATABASE_SQLITE_PATH;
  delete process.env.STORAGE_DIR;
}

function getExpectedDevelopmentStorageDir() {
  const workspaceHash = createHash('sha256')
    .update(path.resolve(process.cwd()))
    .digest('hex')
    .slice(0, 12);

  return path.join(tmpdir(), 'mediavault-dev-storage', workspaceHash);
}

beforeEach(() => {
  vi.resetModules();
  clearPathEnv();
});

afterEach(() => {
  vi.resetModules();
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { force: true, recursive: true });
  }

  if (ORIGINAL_STORAGE_DIR === undefined) {
    delete process.env.STORAGE_DIR;
  }
  else {
    process.env.STORAGE_DIR = ORIGINAL_STORAGE_DIR;
  }

  if (ORIGINAL_DATABASE_SQLITE_PATH === undefined) {
    delete process.env.DATABASE_SQLITE_PATH;
  }
  else {
    process.env.DATABASE_SQLITE_PATH = ORIGINAL_DATABASE_SQLITE_PATH;
  }

  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  }
  else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
});

describe('shared storage paths', () => {
  test('resolves runtime storage paths from the primary storage config', async () => {
    const storageRoot = createWorkspacePath('shared-storage-root');
    process.env.STORAGE_DIR = storageRoot;
    const { getStoragePaths } = await import('../../../app/shared/config/storage-paths.server');
    const { getPrimaryStorageConfig } = await import('../../../app/modules/storage/infrastructure/config/storage-config.server');

    expect(getStoragePaths()).toEqual({
      stagingDir: path.join(storageRoot, 'staging'),
      stagingTempDir: path.join(storageRoot, 'staging', 'temp'),
      storageDir: storageRoot,
      videosDir: path.join(storageRoot, 'videos'),
    });
    expect(getPrimaryStorageConfig()).toEqual({
      databasePath: path.join(storageRoot, 'db.sqlite'),
      stagingDir: path.join(storageRoot, 'staging'),
      stagingTempDir: path.join(storageRoot, 'staging', 'temp'),
      storageDir: storageRoot,
      videosDir: path.join(storageRoot, 'videos'),
    });
  });

  test('falls back to the repository storage directory for production runtime primary config', async () => {
    delete process.env.STORAGE_DIR;
    process.env.NODE_ENV = 'production';
    const { getStoragePaths } = await import('../../../app/shared/config/storage-paths.server');
    const { getPrimaryStorageConfig } = await import('../../../app/modules/storage/infrastructure/config/storage-config.server');

    expect(getStoragePaths()).toEqual({
      stagingDir: path.resolve(process.cwd(), 'storage', 'staging'),
      stagingTempDir: path.resolve(process.cwd(), 'storage', 'staging', 'temp'),
      storageDir: path.resolve(process.cwd(), 'storage'),
      videosDir: path.resolve(process.cwd(), 'storage', 'videos'),
    });
    expect(getPrimaryStorageConfig()).toEqual({
      databasePath: path.resolve(process.cwd(), 'storage', 'db.sqlite'),
      stagingDir: path.resolve(process.cwd(), 'storage', 'staging'),
      stagingTempDir: path.resolve(process.cwd(), 'storage', 'staging', 'temp'),
      storageDir: path.resolve(process.cwd(), 'storage'),
      videosDir: path.resolve(process.cwd(), 'storage', 'videos'),
    });
  });

  test('falls back outside the repository storage directory for development runtime primary config', async () => {
    delete process.env.DATABASE_SQLITE_PATH;
    delete process.env.STORAGE_DIR;
    process.env.NODE_ENV = 'development';
    const { getStoragePaths } = await import('../../../app/shared/config/storage-paths.server');
    const { getPrimaryStorageConfig } = await import('../../../app/modules/storage/infrastructure/config/storage-config.server');
    const storageDir = getExpectedDevelopmentStorageDir();

    expect(getStoragePaths()).toEqual({
      stagingDir: path.join(storageDir, 'staging'),
      stagingTempDir: path.join(storageDir, 'staging', 'temp'),
      storageDir,
      videosDir: path.join(storageDir, 'videos'),
    });
    expect(getPrimaryStorageConfig()).toEqual({
      databasePath: path.join(storageDir, 'db.sqlite'),
      stagingDir: path.join(storageDir, 'staging'),
      stagingTempDir: path.join(storageDir, 'staging', 'temp'),
      storageDir,
      videosDir: path.join(storageDir, 'videos'),
    });
    expect(storageDir).not.toBe(path.resolve(process.cwd(), 'storage'));
  });

  test('respects an explicit DATABASE_SQLITE_PATH override while keeping primary media paths', async () => {
    const storageRoot = createWorkspacePath('shared-storage-root');
    const databaseRoot = createWorkspacePath('custom-db-root');
    const databasePath = path.join(databaseRoot, 'db.sqlite');
    process.env.STORAGE_DIR = storageRoot;
    process.env.DATABASE_SQLITE_PATH = databasePath;
    const { getStoragePaths } = await import('../../../app/shared/config/storage-paths.server');
    const { getPrimaryStorageConfig } = await import('../../../app/modules/storage/infrastructure/config/storage-config.server');

    expect(getStoragePaths()).toEqual({
      stagingDir: path.join(storageRoot, 'staging'),
      stagingTempDir: path.join(storageRoot, 'staging', 'temp'),
      storageDir: storageRoot,
      videosDir: path.join(storageRoot, 'videos'),
    });
    expect(getPrimaryStorageConfig()).toEqual({
      databasePath,
      stagingDir: path.join(storageRoot, 'staging'),
      stagingTempDir: path.join(storageRoot, 'staging', 'temp'),
      storageDir: storageRoot,
      videosDir: path.join(storageRoot, 'videos'),
    });
  });
});
