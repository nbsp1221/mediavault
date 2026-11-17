import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { FilesystemIngestStagedUploadStorageAdapter } from '../../../app/modules/ingest/infrastructure/staging/filesystem-ingest-staged-upload-storage.adapter';

const cleanupTasks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanupTasks.splice(0).map((task) => task()));
});

async function createWorkspace() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'local-streamer-staged-upload-storage-'));
  cleanupTasks.push(async () => rm(workspace, { force: true, recursive: true }));

  return {
    adapter: new FilesystemIngestStagedUploadStorageAdapter({
      storagePaths: {
        stagingDir: path.join(workspace, 'storage', 'data', 'staging'),
        stagingTempDir: path.join(workspace, 'storage', 'data', 'staging', 'temp'),
        storageDir: path.join(workspace, 'storage'),
        videosDir: path.join(workspace, 'storage', 'data', 'videos'),
      },
    }),
    workspace,
  };
}

describe('FilesystemIngestStagedUploadStorageAdapter', () => {
  test('promotes staged temp bytes into the dedicated staging directory', async () => {
    const { adapter, workspace } = await createWorkspace();
    const tempSourcePath = path.join(workspace, 'temp-upload.mp4');
    await writeFile(tempSourcePath, 'video-data');

    const result = await adapter.promote({
      filename: 'fixture-video.mp4',
      sourcePath: tempSourcePath,
      stagingId: 'staging-123',
    });

    await expect(readFile(result.storagePath, 'utf8')).resolves.toBe('video-data');
    await expect(access(tempSourcePath)).rejects.toThrow();
    expect(result.storagePath).toBe(
      path.join(workspace, 'storage', 'data', 'staging', 'staging-123', 'fixture-video.mp4'),
    );
  });

  test('deletes persisted staged bytes and request-scoped temp bytes', async () => {
    const { adapter, workspace } = await createWorkspace();
    const stagedPath = path.join(
      workspace,
      'storage',
      'data',
      'staging',
      'staging-123',
      'fixture-video.mp4',
    );
    const tempPath = path.join(
      workspace,
      'storage',
      'data',
      'staging',
      'temp',
      'request-123',
      'fixture-video.mp4',
    );
    await mkdir(path.dirname(stagedPath), { recursive: true });
    await mkdir(path.dirname(tempPath), { recursive: true });
    await writeFile(stagedPath, 'video-data');
    await writeFile(tempPath, 'temp-data');

    await adapter.delete(stagedPath);
    await adapter.deleteTemp(tempPath);

    await expect(access(stagedPath)).rejects.toThrow();
    await expect(access(tempPath)).rejects.toThrow();
  });
});
