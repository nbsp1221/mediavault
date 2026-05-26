import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

const SqliteLibraryVideoMutationAdapterMock = vi.fn();
const FilesystemLibraryVideoArtifactRemovalAdapterMock = vi.fn();

vi.mock('~/modules/library/infrastructure/sqlite/sqlite-library-video-mutation.adapter', () => ({
  SqliteLibraryVideoMutationAdapter: SqliteLibraryVideoMutationAdapterMock,
}));

vi.mock('~/modules/library/infrastructure/storage/filesystem-library-video-artifact-removal.adapter', () => ({
  FilesystemLibraryVideoArtifactRemovalAdapter: FilesystemLibraryVideoArtifactRemovalAdapterMock,
}));

describe('server library mutation composition root', () => {
  afterEach(() => {
    vi.resetModules();
    SqliteLibraryVideoMutationAdapterMock.mockReset();
    FilesystemLibraryVideoArtifactRemovalAdapterMock.mockReset();
  });

  test('creates prewired update and delete services from the injected mutation port', async () => {
    const { createServerLibraryServices } = await import('../../../app/composition/server/library');
    const findLibraryVideoById = vi.fn(async videoId => ({
      createdAt: new Date('2026-03-11T00:00:00.000Z'),
      duration: 180,
      id: videoId,
      ownerId: 'owner-1',
      tags: ['Action'],
      title: 'Fixture Video',
      videoUrl: '/videos/video-1/manifest.mpd',
      visibility: 'private' as const,
    }));
    const updateLibraryVideo = vi.fn(async input => ({
      createdAt: new Date('2026-03-11T00:00:00.000Z'),
      description: input.description,
      duration: 180,
      id: input.videoId,
      ownerId: 'owner-1',
      tags: input.tags,
      title: input.title,
      videoUrl: '/videos/video-1/manifest.mpd',
      visibility: 'private' as const,
    }));
    const deleteLibraryVideo = vi.fn(async () => ({
      deleted: true,
      title: 'Fixture Video',
    }));
    const cleanupVideoArtifacts = vi.fn(async () => ({}));

    const services = createServerLibraryServices({
      artifactRemovalPort: {
        cleanupVideoArtifacts,
      },
      mutationPort: {
        deleteLibraryVideo,
        findLibraryVideoById,
        updateLibraryVideo,
      },
      videoSource: {
        listActiveContentTypes: vi.fn(async () => []),
        listActiveGenres: vi.fn(async () => []),
        listLibraryVideos: vi.fn(async () => []),
      },
    });

    await expect(services.updateLibraryVideo.execute({
      description: ' Updated description ',
      tags: [' Action ', 'Neo'],
      title: ' Updated title ',
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
      videoId: 'video-1',
    })).resolves.toEqual({
      data: {
        message: 'Video "Updated title" updated successfully',
        video: expect.objectContaining({
          id: 'video-1',
          title: 'Updated title',
        }),
      },
      ok: true,
    });
    await expect(services.deleteLibraryVideo.execute({
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
      videoId: 'video-1',
    })).resolves.toEqual({
      data: {
        message: 'Video deleted successfully',
        title: 'Fixture Video',
        videoId: 'video-1',
        warning: undefined,
      },
      ok: true,
    });
    expect(SqliteLibraryVideoMutationAdapterMock).not.toHaveBeenCalled();
    expect(FilesystemLibraryVideoArtifactRemovalAdapterMock).not.toHaveBeenCalled();
  });

  test('returns a cached default composition with update and delete services ready for route usage', async () => {
    SqliteLibraryVideoMutationAdapterMock.mockImplementation(() => ({
      deleteLibraryVideo: vi.fn(async () => ({
        deleted: true,
        title: 'Fixture Video',
      })),
      findLibraryVideoById: vi.fn(async videoId => ({
        createdAt: new Date('2026-03-11T00:00:00.000Z'),
        duration: 180,
        id: videoId,
        ownerId: 'owner-1',
        tags: ['Action'],
        title: 'Fixture Video',
        videoUrl: '/videos/video-1/manifest.mpd',
        visibility: 'private' as const,
      })),
      updateLibraryVideo: vi.fn(async input => ({
        createdAt: new Date('2026-03-11T00:00:00.000Z'),
        duration: 180,
        id: input.videoId,
        ownerId: 'owner-1',
        tags: input.tags,
        title: input.title,
        videoUrl: '/videos/video-1/manifest.mpd',
        visibility: 'private' as const,
      })),
    }));
    FilesystemLibraryVideoArtifactRemovalAdapterMock.mockImplementation(() => ({
      cleanupVideoArtifacts: vi.fn(async () => ({})),
    }));
    vi.resetModules();

    const { getServerLibraryServices } = await import('../../../app/composition/server/library');
    const first = getServerLibraryServices();
    const second = getServerLibraryServices();

    expect(first).toBe(second);
    expect(first.updateLibraryVideo).toBeDefined();
    expect(first.deleteLibraryVideo).toBeDefined();
    expect(SqliteLibraryVideoMutationAdapterMock).toHaveBeenCalledOnce();
    expect(FilesystemLibraryVideoArtifactRemovalAdapterMock).toHaveBeenCalledOnce();
  });

  test('library write composition root does not import the retiring library mutation seam file', async () => {
    const source = await readFile(resolve(process.cwd(), 'app/composition/server/library.ts'), 'utf8');

    expect(source.includes('./library-legacy-video-mutation')).toBe(false);
  });
});
