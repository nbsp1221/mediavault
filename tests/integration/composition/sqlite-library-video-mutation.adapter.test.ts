import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('sqlite library video mutation adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('reads and updates library videos through the sqlite metadata repository', async () => {
    const findById = vi.fn(async (videoId: string) => ({
      contentTypeSlug: 'movie',
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      description: 'Fixture description',
      duration: 95,
      genreSlugs: ['action'],
      id: videoId,
      ownerId: 'owner-1',
      tags: ['Action', 'Drama'],
      thumbnailUrl: '/api/thumbnail/video-1',
      title: 'Fixture Video',
      videoUrl: '/videos/video-1/manifest.mpd',
      visibility: 'private' as const,
    }));
    const update = vi.fn(async (videoId: string, input: Record<string, unknown>) => ({
      contentTypeSlug: input.contentTypeSlug as string | undefined,
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      description: input.description as string,
      duration: 95,
      genreSlugs: input.genreSlugs as string[],
      id: videoId,
      ownerId: 'owner-1',
      tags: input.tags as string[],
      thumbnailUrl: '/api/thumbnail/video-1',
      title: input.title as string,
      videoUrl: '/videos/video-1/manifest.mpd',
      visibility: 'private' as const,
    }));

    const { SqliteLibraryVideoMutationAdapter } = await import('../../../app/modules/library/infrastructure/sqlite/sqlite-library-video-mutation.adapter');
    const adapter = new SqliteLibraryVideoMutationAdapter({
      repository: {
        delete: vi.fn(),
        findById,
        findOwnedById: findById,
        update,
        updateVisibility: vi.fn(),
      },
    });

    await expect(adapter.findOwnedLibraryVideoById({
      ownerId: 'owner-1',
      videoId: 'video-1',
    })).resolves.toEqual(expect.objectContaining({
      id: 'video-1',
      title: 'Fixture Video',
    }));
    await expect(adapter.updateLibraryVideo({
      contentTypeSlug: 'home_video',
      description: 'Updated description',
      genreSlugs: ['documentary'],
      tags: ['Neo'],
      title: 'Updated title',
      videoId: 'video-1',
    })).resolves.toEqual(expect.objectContaining({
      description: 'Updated description',
      genreSlugs: ['documentary'],
      id: 'video-1',
      tags: ['Neo'],
      title: 'Updated title',
    }));

    expect(findById).toHaveBeenCalledWith('video-1', 'owner-1');
    expect(update).toHaveBeenCalledWith('video-1', {
      contentTypeSlug: 'home_video',
      description: 'Updated description',
      genreSlugs: ['documentary'],
      tags: ['Neo'],
      title: 'Updated title',
    });
  });

  test('preserves structured metadata omission semantics at the repository boundary', async () => {
    const findById = vi.fn();
    const update = vi.fn(async (videoId: string, input: Record<string, unknown>) => ({
      contentTypeSlug: input.contentTypeSlug as string | undefined,
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      description: input.description as string,
      duration: 95,
      genreSlugs: input.genreSlugs as string[] | undefined ?? ['action'],
      id: videoId,
      ownerId: 'owner-1',
      tags: input.tags as string[],
      thumbnailUrl: '/api/thumbnail/video-1',
      title: input.title as string,
      videoUrl: '/videos/video-1/manifest.mpd',
      visibility: 'private' as const,
    }));

    const { SqliteLibraryVideoMutationAdapter } = await import('../../../app/modules/library/infrastructure/sqlite/sqlite-library-video-mutation.adapter');
    const adapter = new SqliteLibraryVideoMutationAdapter({
      repository: {
        delete: vi.fn(),
        findById,
        findOwnedById: vi.fn(),
        update,
        updateVisibility: vi.fn(),
      },
    });

    await adapter.updateLibraryVideo({
      description: 'Updated description',
      tags: ['Neo'],
      title: 'Updated title',
      videoId: 'video-1',
    });

    expect(update).toHaveBeenNthCalledWith(1, 'video-1', {
      description: 'Updated description',
      tags: ['Neo'],
      title: 'Updated title',
    });
    expect(Object.hasOwn(update.mock.calls[0][1], 'contentTypeSlug')).toBe(false);
    expect(Object.hasOwn(update.mock.calls[0][1], 'genreSlugs')).toBe(false);

    await adapter.updateLibraryVideo({
      contentTypeSlug: undefined,
      description: 'Updated description',
      tags: ['Neo'],
      title: 'Updated title',
      videoId: 'video-1',
    });

    expect(update).toHaveBeenNthCalledWith(2, 'video-1', {
      description: 'Updated description',
      tags: ['Neo'],
      title: 'Updated title',
    });
    expect(Object.hasOwn(update.mock.calls[1][1], 'contentTypeSlug')).toBe(false);

    await adapter.updateLibraryVideo({
      contentTypeSlug: null,
      description: 'Updated description',
      genreSlugs: [],
      tags: ['Neo'],
      title: 'Updated title',
      videoId: 'video-1',
    });

    expect(update).toHaveBeenNthCalledWith(3, 'video-1', {
      contentTypeSlug: null,
      description: 'Updated description',
      genreSlugs: [],
      tags: ['Neo'],
      title: 'Updated title',
    });
  });

  test('resolves visibility-management targets and updates visibility through the repository', async () => {
    const ownerVideo = {
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      duration: 95,
      id: 'owner-video',
      ownerId: 'owner-1',
      tags: ['Action'],
      title: 'Owner Video',
      videoUrl: '/videos/owner-video/manifest.mpd',
      visibility: 'private' as const,
    };
    const publicOtherVideo = {
      ...ownerVideo,
      id: 'public-other',
      ownerId: 'owner-2',
      visibility: 'public' as const,
    };
    const privateOtherVideo = {
      ...ownerVideo,
      id: 'private-other',
      ownerId: 'owner-2',
    };
    const findById = vi.fn(async (videoId: string) => {
      if (videoId === 'owner-video') return ownerVideo;
      if (videoId === 'public-other') return publicOtherVideo;
      if (videoId === 'private-other') return privateOtherVideo;
      return null;
    });
    const updateVisibility = vi.fn(async (videoId: string, ownerId: string, visibility: 'private' | 'public') => ({
      ...ownerVideo,
      id: videoId,
      ownerId,
      visibility,
    }));

    const { SqliteLibraryVideoMutationAdapter } = await import('../../../app/modules/library/infrastructure/sqlite/sqlite-library-video-mutation.adapter');
    const adapter = new SqliteLibraryVideoMutationAdapter({
      repository: {
        delete: vi.fn(),
        findById,
        findOwnedById: vi.fn(),
        update: vi.fn(),
        updateVisibility,
      },
    });

    await expect(adapter.resolveVisibilityManagementTarget({
      requesterId: 'owner-1',
      videoId: 'owner-video',
    })).resolves.toEqual({
      type: 'owned',
      video: ownerVideo,
    });
    await expect(adapter.resolveVisibilityManagementTarget({
      requesterId: 'owner-1',
      videoId: 'public-other',
    })).resolves.toEqual({ type: 'public_non_owner' });
    await expect(adapter.resolveVisibilityManagementTarget({
      requesterId: 'owner-1',
      videoId: 'private-other',
    })).resolves.toEqual({ type: 'not_found_or_private_inaccessible' });
    await expect(adapter.resolveVisibilityManagementTarget({
      requesterId: 'owner-1',
      videoId: 'missing-video',
    })).resolves.toEqual({ type: 'not_found_or_private_inaccessible' });
    await expect(adapter.updateLibraryVideoVisibility({
      ownerId: 'owner-1',
      videoId: 'owner-video',
      visibility: 'public',
    })).resolves.toEqual(expect.objectContaining({
      id: 'owner-video',
      visibility: 'public',
    }));
    expect(updateVisibility).toHaveBeenCalledWith('owner-video', 'owner-1', 'public');
  });

  test('preserves the delete result contract expected by the library use case', async () => {
    const findById = vi
      .fn()
      .mockResolvedValueOnce({
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
        duration: 95,
        genreSlugs: [],
        id: 'video-1',
        ownerId: 'owner-1',
        tags: ['Action'],
        title: 'Fixture Video',
        videoUrl: '/videos/video-1/manifest.mpd',
        visibility: 'private' as const,
      })
      .mockResolvedValueOnce(null);
    const remove = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const { SqliteLibraryVideoMutationAdapter } = await import('../../../app/modules/library/infrastructure/sqlite/sqlite-library-video-mutation.adapter');
    const adapter = new SqliteLibraryVideoMutationAdapter({
      repository: {
        delete: remove,
        findById,
        findOwnedById: vi.fn(),
        update: vi.fn(),
        updateVisibility: vi.fn(),
      },
    });

    await expect(adapter.deleteLibraryVideo({ videoId: 'video-1' })).resolves.toEqual({
      deleted: true,
      title: 'Fixture Video',
    });
    await expect(adapter.deleteLibraryVideo({ videoId: 'missing-video' })).resolves.toEqual({
      deleted: false,
    });

    expect(remove).toHaveBeenNthCalledWith(1, 'video-1');
    expect(remove).not.toHaveBeenNthCalledWith(2, 'missing-video');
  });
});
