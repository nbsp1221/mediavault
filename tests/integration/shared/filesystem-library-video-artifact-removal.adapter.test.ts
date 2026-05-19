import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('filesystem library video artifact removal adapter', () => {
  let tempDir = '';
  let previousStorageDir: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'local-streamer-library-artifacts-'));
    previousStorageDir = process.env.MEDIAVAULT_STORAGE_DIR;
    process.env.MEDIAVAULT_STORAGE_DIR = tempDir;
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (previousStorageDir === undefined) {
      delete process.env.MEDIAVAULT_STORAGE_DIR;
    }
    else {
      process.env.MEDIAVAULT_STORAGE_DIR = previousStorageDir;
    }

    vi.resetModules();

    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = '';
    }
  });

  test('removes the active video workspace directory and returns an empty result on success', async () => {
    const videoDir = join(tempDir, 'videos', 'video-1');
    await mkdir(videoDir, { recursive: true });

    const { FilesystemLibraryVideoArtifactRemovalAdapter } = await import('../../../app/modules/library/infrastructure/storage/filesystem-library-video-artifact-removal.adapter');
    const removeDir = vi.fn(async (_targetPath: string) => undefined);
    const adapter = new FilesystemLibraryVideoArtifactRemovalAdapter({
      removeDir,
    });

    await expect(adapter.cleanupVideoArtifacts({ videoId: 'video-1' })).resolves.toEqual({});
    expect(removeDir).toHaveBeenCalledWith(videoDir);
  });

  test('returns the existing warning contract when workspace cleanup fails', async () => {
    const logger = {
      error: vi.fn(),
    };

    const { FilesystemLibraryVideoArtifactRemovalAdapter } = await import('../../../app/modules/library/infrastructure/storage/filesystem-library-video-artifact-removal.adapter');
    const adapter = new FilesystemLibraryVideoArtifactRemovalAdapter({
      logger,
      removeDir: vi.fn(async () => {
        throw new Error('boom');
      }),
    });

    await expect(adapter.cleanupVideoArtifacts({ videoId: 'video-1' })).resolves.toEqual({
      warning: 'Video files could not be fully removed',
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
