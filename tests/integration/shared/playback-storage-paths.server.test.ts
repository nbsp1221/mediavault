import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

const ORIGINAL_STORAGE_DIR = process.env.MEDIAVAULT_STORAGE_DIR;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function getExpectedDevelopmentStorageDir() {
  const workspaceHash = createHash('sha256')
    .update(path.resolve(process.cwd()))
    .digest('hex')
    .slice(0, 12);

  return path.join(tmpdir(), 'mediavault-dev-storage', workspaceHash);
}

afterEach(() => {
  vi.resetModules();

  if (ORIGINAL_STORAGE_DIR === undefined) {
    delete process.env.MEDIAVAULT_STORAGE_DIR;
  }
  else {
    process.env.MEDIAVAULT_STORAGE_DIR = ORIGINAL_STORAGE_DIR;
  }

  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  }
  else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
});

describe('getPlaybackStoragePaths', () => {
  test('resolves playback videos directory from MEDIAVAULT_STORAGE_DIR when provided', async () => {
    process.env.MEDIAVAULT_STORAGE_DIR = '/tmp/playback-storage-root';
    const { getPlaybackStoragePaths } = await import('../../../app/modules/playback/infrastructure/storage/playback-storage-paths.server');

    expect(getPlaybackStoragePaths()).toEqual({
      storageDir: path.resolve('/tmp/playback-storage-root'),
      videosDir: path.resolve('/tmp/playback-storage-root', 'videos'),
    });
  });

  test('falls back to the repo storage directory when MEDIAVAULT_STORAGE_DIR is absent in production', async () => {
    delete process.env.MEDIAVAULT_STORAGE_DIR;
    process.env.NODE_ENV = 'production';
    const { getPlaybackStoragePaths } = await import('../../../app/modules/playback/infrastructure/storage/playback-storage-paths.server');

    expect(getPlaybackStoragePaths()).toEqual({
      storageDir: path.resolve(process.cwd(), 'storage'),
      videosDir: path.resolve(process.cwd(), 'storage', 'videos'),
    });
  });

  test('falls back outside the repo storage directory when MEDIAVAULT_STORAGE_DIR is absent in development', async () => {
    delete process.env.MEDIAVAULT_STORAGE_DIR;
    process.env.NODE_ENV = 'development';
    const { getPlaybackStoragePaths } = await import('../../../app/modules/playback/infrastructure/storage/playback-storage-paths.server');
    const storageDir = getExpectedDevelopmentStorageDir();

    expect(getPlaybackStoragePaths()).toEqual({
      storageDir,
      videosDir: path.join(storageDir, 'videos'),
    });
    expect(storageDir).not.toBe(path.resolve(process.cwd(), 'storage'));
  });
});
