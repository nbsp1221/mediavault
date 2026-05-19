import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { seedLibraryVideoMetadata } from '../../support/seed-library-video-metadata';

const cleanupTasks: Array<() => Promise<void>> = [];
const ORIGINAL_STORAGE_DIR = process.env.MEDIAVAULT_STORAGE_DIR;

afterEach(async () => {
  await Promise.all(cleanupTasks.splice(0).map(task => task()));
  vi.resetModules();

  if (ORIGINAL_STORAGE_DIR === undefined) {
    delete process.env.MEDIAVAULT_STORAGE_DIR;
  }
  else {
    process.env.MEDIAVAULT_STORAGE_DIR = ORIGINAL_STORAGE_DIR;
  }
});

async function seedStorage(storageDir: string, videoId: string) {
  await mkdir(storageDir, { recursive: true });
  await seedLibraryVideoMetadata(join(storageDir, 'db.sqlite'), [
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

describe('PlaybackVideoCatalogAdapter path resolution', () => {
  test('derives storage and SQLite paths from the current workspace at construction time', async () => {
    const workspaceOne = await mkdtemp(join(tmpdir(), 'local-streamer-catalog-path-1-'));
    const workspaceTwo = await mkdtemp(join(tmpdir(), 'local-streamer-catalog-path-2-'));
    cleanupTasks.push(async () => rm(workspaceOne, { force: true, recursive: true }));
    cleanupTasks.push(async () => rm(workspaceTwo, { force: true, recursive: true }));

    const storageOne = join(workspaceOne, 'storage');
    const storageTwo = join(workspaceTwo, 'storage');
    await seedStorage(storageOne, 'workspace-one-video');
    await seedStorage(storageTwo, 'workspace-two-video');

    process.env.MEDIAVAULT_STORAGE_DIR = storageOne;
    vi.resetModules();

    const { PlaybackVideoCatalogAdapter: FirstPlaybackVideoCatalogAdapter } = await import('../../../app/modules/playback/infrastructure/catalog/playback-video-catalog.adapter');
    const firstAdapter = new FirstPlaybackVideoCatalogAdapter();

    await expect(firstAdapter.getPlayerVideo('workspace-one-video')).resolves.toEqual({
      relatedVideos: [],
      video: expect.objectContaining({ id: 'workspace-one-video' }),
    });

    process.env.MEDIAVAULT_STORAGE_DIR = storageTwo;
    vi.resetModules();

    const { PlaybackVideoCatalogAdapter: SecondPlaybackVideoCatalogAdapter } = await import('../../../app/modules/playback/infrastructure/catalog/playback-video-catalog.adapter');
    const secondAdapter = new SecondPlaybackVideoCatalogAdapter();

    await expect(secondAdapter.getPlayerVideo('workspace-two-video')).resolves.toEqual({
      relatedVideos: [],
      video: expect.objectContaining({ id: 'workspace-two-video' }),
    });
  });

  test('does not read player metadata from videos.json when SQLite is empty', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'local-streamer-catalog-no-bootstrap-'));
    cleanupTasks.push(async () => rm(workspace, { force: true, recursive: true }));

    const storageDir = join(workspace, 'storage');
    const dataDir = join(storageDir, 'data');
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, 'videos.json'), JSON.stringify([
      {
        addedAt: '2026-03-24T00:00:00.000Z',
        duration: 90,
        id: 'legacy-catalog-video',
        tags: ['vault'],
        title: 'legacy-catalog-video',
        videoUrl: '/videos/legacy-catalog-video/manifest.mpd',
      },
    ], null, 2));

    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;
    vi.resetModules();

    const { PlaybackVideoCatalogAdapter } = await import('../../../app/modules/playback/infrastructure/catalog/playback-video-catalog.adapter');
    const adapter = new PlaybackVideoCatalogAdapter();

    await expect(adapter.getPlayerVideo('legacy-catalog-video')).resolves.toBeNull();
  });
});
