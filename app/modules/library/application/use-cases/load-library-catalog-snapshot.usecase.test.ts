import { describe, expect, test, vi } from 'vitest';
import type { LibraryVideo } from '../../domain/library-video';
import { LoadLibraryCatalogSnapshotUseCase } from './load-library-catalog-snapshot.usecase';

function createFixtureVideo(overrides: Partial<LibraryVideo> = {}): LibraryVideo {
  return {
    contentTypeSlug: 'movie',
    createdAt: new Date('2026-03-10T00:00:00.000Z'),
    duration: 120,
    genreSlugs: ['drama'],
    id: 'video-1',
    ownerId: 'owner-1',
    tags: ['Action'],
    title: 'Library Fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    visibility: 'private',
    ...overrides,
  };
}

describe('LoadLibraryCatalogSnapshotUseCase', () => {
  test('returns the full video collection with canonical filters and no pre-filtering in this pass', async () => {
    const listLibraryVideos = vi.fn(async () => [
      createFixtureVideo(),
      createFixtureVideo({
        id: 'video-2',
        tags: ['Drama'],
        title: 'Second Fixture',
      }),
    ]);
    const useCase = new LoadLibraryCatalogSnapshotUseCase({
      videoSource: {
        listActiveContentTypes: vi.fn(async () => [
          { active: true, label: 'Movie', slug: 'movie', sortOrder: 10 },
        ]),
        listActiveGenres: vi.fn(async () => [
          { active: true, label: 'Drama', slug: 'drama', sortOrder: 20 },
        ]),
        listLibraryVideos,
      },
    });

    const result = await useCase.execute({
      rawQuery: '  Action  ',
      rawIncludeTags: ['Action', '', 'Drama'],
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        videos: [
          expect.objectContaining({
            id: 'video-1',
            title: 'Library Fixture',
          }),
          expect.objectContaining({
            id: 'video-2',
            title: 'Second Fixture',
          }),
        ],
        filters: {
          contentTypeSlug: undefined,
          displayQuery: '  Action  ',
          excludeTags: [],
          genreSlugs: [],
          includeTags: ['action', 'drama'],
          normalizedQuery: 'action',
        },
        vocabulary: {
          contentTypes: [
            { active: true, label: 'Movie', slug: 'movie', sortOrder: 10 },
          ],
          genres: [
            { active: true, label: 'Drama', slug: 'drama', sortOrder: 20 },
          ],
        },
      },
    });
    expect(listLibraryVideos).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      type: 'public_or_owned',
    });

    if (!result.ok) {
      throw new Error('Expected successful catalog result');
    }

    expect(result.data.videos).toHaveLength(2);
    expect(result.data.videos[0]?.createdAt).toBeInstanceOf(Date);
  });

  test('returns an explicit unavailable result when the source port cannot provide catalog data', async () => {
    const useCase = new LoadLibraryCatalogSnapshotUseCase({
      videoSource: {
        listActiveContentTypes: vi.fn(async () => []),
        listActiveGenres: vi.fn(async () => []),
        listLibraryVideos: vi.fn(async () => {
          throw new Error('storage offline');
        }),
      },
    });

    await expect(useCase.execute({
      rawQuery: 'Anything',
      rawIncludeTags: [],
      viewer: {
        type: 'anonymous',
      },
    })).resolves.toEqual({
      ok: false,
      reason: 'CATALOG_SOURCE_UNAVAILABLE',
    });
  });

  test('passes public-only scope for anonymous catalog reads', async () => {
    const listLibraryVideos = vi.fn(async () => []);
    const useCase = new LoadLibraryCatalogSnapshotUseCase({
      videoSource: {
        listActiveContentTypes: vi.fn(async () => []),
        listActiveGenres: vi.fn(async () => []),
        listLibraryVideos,
      },
    });

    await useCase.execute({
      viewer: { type: 'anonymous' },
    });

    expect(listLibraryVideos).toHaveBeenCalledWith({
      type: 'public_only',
    });
  });
});
