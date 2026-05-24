import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('sqlite canonical video metadata adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('adapts the sqlite metadata repository to both library reads and ingest metadata writes', async () => {
    const findAll = vi.fn(async () => [
      {
        contentTypeSlug: 'movie',
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
        description: 'Fixture description',
        duration: 95,
        genreSlugs: ['action'],
        id: 'video-1',
        ownerId: 'owner-1',
        tags: ['Action', 'Drama'],
        thumbnailUrl: '/api/thumbnail/video-1',
        title: 'Fixture Video',
        videoUrl: '/videos/video-1/manifest.mpd',
        visibility: 'private' as const,
      },
    ]);
    const create = vi.fn(async () => ({
      contentTypeSlug: 'home_video',
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      description: 'A test video',
      duration: 120,
      genreSlugs: ['documentary'],
      id: 'video-123',
      ownerId: 'owner-1',
      tags: ['fixture', 'test'],
      thumbnailUrl: '/api/thumbnail/video-123',
      title: 'Fixture Video',
      videoUrl: '/videos/video-123/manifest.mpd',
      visibility: 'private' as const,
    }));
    const deleteVideo = vi.fn(async () => true);

    const listActiveContentTypes = vi.fn(async () => [
      { active: true, label: 'Movie', slug: 'movie', sortOrder: 10 },
    ]);
    const listActiveGenres = vi.fn(async () => [
      { active: true, label: 'Documentary', slug: 'documentary', sortOrder: 40 },
    ]);
    const { SqliteCanonicalVideoMetadataAdapter } = await import('../../../app/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter');
    const adapter = new SqliteCanonicalVideoMetadataAdapter({
      repository: {
        create,
        delete: deleteVideo,
        findAll,
        listActiveContentTypes,
        listActiveGenres,
      },
    });

    await expect(adapter.listLibraryVideos()).resolves.toEqual([
      expect.objectContaining({
        id: 'video-1',
        title: 'Fixture Video',
      }),
    ]);
    await expect(adapter.writeVideoRecord({
      contentTypeSlug: 'home_video',
      description: 'A test video',
      duration: 120,
      genreSlugs: ['documentary'],
      id: 'video-123',
      ownerId: 'owner-1',
      tags: ['fixture', 'test'],
      thumbnailUrl: '/api/thumbnail/video-123',
      title: 'Fixture Video',
      videoUrl: '/videos/video-123/manifest.mpd',
      visibility: 'private' as const,
    })).resolves.toBeUndefined();
    await expect(adapter.deleteVideoRecord('video-123')).resolves.toBeUndefined();

    expect(findAll).toHaveBeenCalledOnce();
    await expect(adapter.listActiveContentTypes()).resolves.toEqual([
      { active: true, label: 'Movie', slug: 'movie', sortOrder: 10 },
    ]);
    await expect(adapter.listActiveGenres()).resolves.toEqual([
      { active: true, label: 'Documentary', slug: 'documentary', sortOrder: 40 },
    ]);
    expect(create).toHaveBeenCalledWith({
      contentTypeSlug: 'home_video',
      description: 'A test video',
      duration: 120,
      genreSlugs: ['documentary'],
      id: 'video-123',
      ownerId: 'owner-1',
      tags: ['fixture', 'test'],
      thumbnailUrl: '/api/thumbnail/video-123',
      title: 'Fixture Video',
      videoUrl: '/videos/video-123/manifest.mpd',
      visibility: 'private' as const,
    });
    expect(deleteVideo).toHaveBeenCalledWith('video-123');
  });

  test('does not delete an existing video when creating a new record fails', async () => {
    const create = vi.fn(async () => {
      throw new Error('UNIQUE constraint failed: videos.id');
    });
    const deleteVideo = vi.fn(async () => true);
    const { SqliteCanonicalVideoMetadataAdapter } = await import('../../../app/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter');
    const adapter = new SqliteCanonicalVideoMetadataAdapter({
      repository: {
        create,
        delete: deleteVideo,
        findAll: vi.fn(async () => []),
        listActiveContentTypes: vi.fn(async () => []),
        listActiveGenres: vi.fn(async () => []),
      },
    });

    await expect(adapter.writeVideoRecord({
      contentTypeSlug: undefined,
      description: undefined,
      duration: 120,
      genreSlugs: [],
      id: 'existing-video',
      ownerId: 'owner-1',
      tags: [],
      thumbnailUrl: '/api/thumbnail/existing-video',
      title: 'Existing Video',
      videoUrl: '/videos/existing-video/manifest.mpd',
      visibility: 'private' as const,
    })).rejects.toThrow(/UNIQUE constraint/);
    expect(deleteVideo).not.toHaveBeenCalled();
  });
});
