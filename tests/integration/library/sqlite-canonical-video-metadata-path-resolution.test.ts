import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { seedLibraryVideoMetadata } from '../../support/seed-library-video-metadata';

const cleanupTasks: Array<() => Promise<void>> = [];
const originalStorageDir = process.env.MEDIAVAULT_STORAGE_DIR;

afterEach(async () => {
  vi.resetModules();
  await Promise.all(cleanupTasks.splice(0).map(task => task()));

  if (originalStorageDir === undefined) {
    delete process.env.MEDIAVAULT_STORAGE_DIR;
  }
  else {
    process.env.MEDIAVAULT_STORAGE_DIR = originalStorageDir;
  }
});

async function seedWorkspace(storageDir: string, videoId: string) {
  await mkdir(storageDir, { recursive: true });
  process.env.MEDIAVAULT_STORAGE_DIR = storageDir;
  await seedLibraryVideoMetadata(path.join(storageDir, 'db.sqlite'), [
    {
      createdAt: '2026-03-24T00:00:00.000Z',
      description: `Fixture for ${videoId}`,
      duration: 90,
      id: videoId,
      tags: ['vault'],
      thumbnailUrl: `/api/thumbnail/${videoId}`,
      title: videoId,
      videoUrl: `/videos/${videoId}/manifest.mpd`,
    },
  ]);
}

describe('active SQLite metadata path resolution', () => {
  test('SqliteCanonicalVideoMetadataAdapter binds MEDIAVAULT_STORAGE_DIR at construction time', async () => {
    const workspaceOne = await mkdtemp(path.join(tmpdir(), 'local-streamer-canonical-path-1-'));
    const workspaceTwo = await mkdtemp(path.join(tmpdir(), 'local-streamer-canonical-path-2-'));
    cleanupTasks.push(async () => rm(workspaceOne, { force: true, recursive: true }));
    cleanupTasks.push(async () => rm(workspaceTwo, { force: true, recursive: true }));

    const storageOne = path.join(workspaceOne, 'storage');
    const storageTwo = path.join(workspaceTwo, 'storage');
    await seedWorkspace(storageOne, 'workspace-one-video');
    await seedWorkspace(storageTwo, 'workspace-two-video');

    process.env.MEDIAVAULT_STORAGE_DIR = storageOne;
    vi.resetModules();

    const { SqliteCanonicalVideoMetadataAdapter } = await import('../../../app/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter');
    const firstAdapter = new SqliteCanonicalVideoMetadataAdapter();

    await expect(firstAdapter.listLibraryVideos()).resolves.toEqual([
      expect.objectContaining({ id: 'workspace-one-video' }),
    ]);

    process.env.MEDIAVAULT_STORAGE_DIR = storageTwo;

    const secondAdapter = new SqliteCanonicalVideoMetadataAdapter();

    await expect(secondAdapter.listLibraryVideos()).resolves.toEqual([
      expect.objectContaining({ id: 'workspace-two-video' }),
    ]);
  });

  test('SqliteLibraryVideoMutationAdapter follows the current workspace when instantiated after env changes', async () => {
    const workspaceOne = await mkdtemp(path.join(tmpdir(), 'local-streamer-mutation-path-1-'));
    const workspaceTwo = await mkdtemp(path.join(tmpdir(), 'local-streamer-mutation-path-2-'));
    cleanupTasks.push(async () => rm(workspaceOne, { force: true, recursive: true }));
    cleanupTasks.push(async () => rm(workspaceTwo, { force: true, recursive: true }));

    const storageOne = path.join(workspaceOne, 'storage');
    const storageTwo = path.join(workspaceTwo, 'storage');
    await seedWorkspace(storageOne, 'mutation-one-video');
    await seedWorkspace(storageTwo, 'mutation-two-video');

    process.env.MEDIAVAULT_STORAGE_DIR = storageOne;
    vi.resetModules();

    const { SqliteLibraryVideoMutationAdapter } = await import('../../../app/modules/library/infrastructure/sqlite/sqlite-library-video-mutation.adapter');
    const firstAdapter = new SqliteLibraryVideoMutationAdapter();

    await expect(firstAdapter.findLibraryVideoById('mutation-one-video')).resolves.toEqual(
      expect.objectContaining({ id: 'mutation-one-video' }),
    );

    process.env.MEDIAVAULT_STORAGE_DIR = storageTwo;

    const secondAdapter = new SqliteLibraryVideoMutationAdapter();

    await expect(secondAdapter.findLibraryVideoById('mutation-two-video')).resolves.toEqual(
      expect.objectContaining({ id: 'mutation-two-video' }),
    );
  });

  test('ignores legacy videos.json when SQLite is empty', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'local-streamer-canonical-no-bootstrap-'));
    cleanupTasks.push(async () => rm(workspace, { force: true, recursive: true }));

    const storageDir = path.join(workspace, 'storage');
    const dataDir = path.join(storageDir, 'data');
    const sqlitePath = path.join(storageDir, 'db.sqlite');
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, 'videos.json'), JSON.stringify([
      {
        addedAt: '2026-03-24T00:00:00.000Z',
        duration: 90,
        id: 'legacy-json-video',
        tags: ['vault'],
        title: 'legacy-json-video',
        videoUrl: '/videos/legacy-json-video/manifest.mpd',
      },
    ], null, 2));

    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;
    vi.resetModules();

    const { SqliteCanonicalVideoMetadataAdapter } = await import('../../../app/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter');
    const { SqliteLibraryVideoMetadataRepository } = await import('../../../app/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository');

    const adapter = new SqliteCanonicalVideoMetadataAdapter();
    const repository = new SqliteLibraryVideoMetadataRepository({ dbPath: sqlitePath });

    await expect(adapter.listLibraryVideos()).resolves.toEqual([]);
    await expect(repository.count()).resolves.toBe(0);
  });
});
