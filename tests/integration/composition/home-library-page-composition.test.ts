import { afterEach, describe, expect, test, vi } from 'vitest';
import type { LibraryVideo } from '../../../app/modules/library/domain/library-video';

function createFixtureVideo(overrides: Partial<LibraryVideo> = {}): LibraryVideo {
  return {
    createdAt: new Date('2026-03-11T00:00:00.000Z'),
    duration: 180,
    genreSlugs: ['action'],
    id: 'video-1',
    contentTypeSlug: 'movie',
    ownerId: 'owner-1',
    tags: ['Action'],
    title: 'Catalog Fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    visibility: 'private',
    ...overrides,
  };
}

describe('home library page composition root', () => {
  afterEach(async () => {
    vi.resetModules();
  });

  test('composes canonical library data through library services only', async () => {
    const { createHomeLibraryPageServices } = await import('../../../app/composition/server/home-library-page');
    const services = createHomeLibraryPageServices({
      libraryServices: {
        loadLibraryCatalogSnapshot: {
          execute: vi.fn(async () => ({
            ok: true as const,
            data: {
              filters: {
                contentTypeSlug: undefined,
                displayQuery: ' Action ',
                excludeTags: [],
                genreSlugs: [],
                includeTags: ['action', 'drama'],
                normalizedQuery: 'action',
              },
              vocabulary: {
                contentTypes: [{ active: true, label: 'Movie', slug: 'movie', sortOrder: 10 }],
                genres: [{ active: true, label: 'Action', slug: 'action', sortOrder: 10 }],
              },
              videos: [createFixtureVideo()],
            },
          })),
        },
      },
    });

    await expect(services.loadHomeLibraryPageData.execute({
      rawQuery: ' Action ',
      rawIncludeTags: ['Action', 'Drama'],
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
    })).resolves.toEqual({
      ok: true,
      data: {
        contentTypes: [{ active: true, label: 'Movie', slug: 'movie', sortOrder: 10 }],
        genres: [{ active: true, label: 'Action', slug: 'action', sortOrder: 10 }],
        videos: [
          expect.objectContaining({
            id: 'video-1',
            isPrivate: true,
            permissions: {
              canDelete: true,
              canEdit: true,
              canManageVisibility: true,
            },
          }),
        ],
      },
    });
  });

  test('maps public non-owner videos to read-only home DTO permissions', async () => {
    const { createHomeLibraryPageServices } = await import('../../../app/composition/server/home-library-page');
    const services = createHomeLibraryPageServices({
      libraryServices: {
        loadLibraryCatalogSnapshot: {
          execute: vi.fn(async () => ({
            ok: true as const,
            data: {
              filters: {
                contentTypeSlug: undefined,
                displayQuery: '',
                excludeTags: [],
                genreSlugs: [],
                includeTags: [],
                normalizedQuery: '',
              },
              vocabulary: {
                contentTypes: [],
                genres: [],
              },
              videos: [
                createFixtureVideo({
                  id: 'public-non-owner',
                  ownerId: 'owner-2',
                  visibility: 'public',
                }),
              ],
            },
          })),
        },
      },
    });

    const result = await services.loadHomeLibraryPageData.execute({
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        contentTypes: [],
        genres: [],
        videos: [
          expect.objectContaining({
            id: 'public-non-owner',
            isPrivate: false,
            permissions: {
              canDelete: false,
              canEdit: false,
              canManageVisibility: false,
            },
          }),
        ],
      },
    });
    if (!result.ok) {
      throw new Error('Expected successful home data result');
    }

    expect('ownerId' in result.data.videos[0]!).toBe(false);
  });

  test('returns an explicit failure when catalog data is unavailable', async () => {
    const { createHomeLibraryPageServices } = await import('../../../app/composition/server/home-library-page');
    const catalogExecute = vi
      .fn()
      .mockResolvedValue({
        ok: false as const,
        reason: 'CATALOG_SOURCE_UNAVAILABLE' as const,
      });
    const services = createHomeLibraryPageServices({
      libraryServices: {
        loadLibraryCatalogSnapshot: {
          execute: catalogExecute,
        },
      },
    });

    await expect(services.loadHomeLibraryPageData.execute({
      rawQuery: '',
      rawIncludeTags: [],
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
    })).resolves.toEqual({
      ok: false,
      reason: 'HOME_DATA_UNAVAILABLE',
    });
    expect(catalogExecute).toHaveBeenCalledOnce();
  });
});
