import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { LibraryVideo } from '../../../app/modules/library/domain/library-video';

const SqliteCanonicalVideoMetadataAdapterMock = vi.fn();
const SqliteLibraryVideoMutationAdapterMock = vi.fn();
const FilesystemLibraryVideoArtifactRemovalAdapterMock = vi.fn();

vi.mock('~/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter', () => ({
  SqliteCanonicalVideoMetadataAdapter: SqliteCanonicalVideoMetadataAdapterMock,
}));

vi.mock('~/modules/library/infrastructure/sqlite/sqlite-library-video-mutation.adapter', () => ({
  SqliteLibraryVideoMutationAdapter: SqliteLibraryVideoMutationAdapterMock,
}));

vi.mock('~/modules/library/infrastructure/storage/filesystem-library-video-artifact-removal.adapter', () => ({
  FilesystemLibraryVideoArtifactRemovalAdapter: FilesystemLibraryVideoArtifactRemovalAdapterMock,
}));

const contentTypesFixture = [
  { active: true, label: 'Movie', slug: 'movie', sortOrder: 10 },
];
const genresFixture = [
  { active: true, label: 'Action', slug: 'action', sortOrder: 10 },
];

function createCatalogVideo(overrides: Partial<LibraryVideo> = {}): LibraryVideo {
  return {
    contentTypeSlug: 'movie',
    createdAt: new Date('2026-03-11T00:00:00.000Z'),
    duration: 180,
    genreSlugs: ['action'],
    id: 'video-1',
    ownerId: 'owner-1',
    tags: ['Action'],
    title: 'Catalog Fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    visibility: 'private',
    ...overrides,
  };
}

describe('server library composition root', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  test('creates prewired library catalog services from injected adapters', async () => {
    const { createServerLibraryServices } = await import('../../../app/composition/server/library');
    const listLibraryVideos = vi.fn(async () => [createCatalogVideo()]);

    const services = createServerLibraryServices({
      videoSource: {
        listActiveContentTypes: vi.fn(async () => contentTypesFixture),
        listActiveGenres: vi.fn(async () => genresFixture),
        listLibraryVideos,
      },
    });
    const result = await services.loadLibraryCatalogSnapshot.execute({
      rawQuery: 'Action',
      rawIncludeTags: ['Action'],
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
    });
    const vocabularyResult = await services.loadVideoMetadataVocabulary.execute();

    expect(listLibraryVideos).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      type: 'public_or_owned',
    });
    expect(result).toEqual({
      ok: true,
      data: {
        videos: [
          expect.objectContaining({
            id: 'video-1',
            title: 'Catalog Fixture',
          }),
        ],
        vocabulary: {
          contentTypes: contentTypesFixture,
          genres: genresFixture,
        },
        filters: {
          contentTypeSlug: undefined,
          displayQuery: 'Action',
          excludeTags: [],
          genreSlugs: [],
          includeTags: ['action'],
          normalizedQuery: 'action',
        },
      },
    });
    expect(vocabularyResult).toEqual({
      ok: true,
      data: {
        contentTypes: contentTypesFixture,
        genres: genresFixture,
      },
    });
  });

  test('returns a cached default library composition that stays ready for route usage', async () => {
    const listLibraryVideos = vi.fn(async () => [createCatalogVideo()]);
    SqliteCanonicalVideoMetadataAdapterMock.mockImplementation(() => ({
      listActiveContentTypes: vi.fn(async () => contentTypesFixture),
      listActiveGenres: vi.fn(async () => genresFixture),
      listLibraryVideos,
      writeVideoRecord: vi.fn(),
    }));
    FilesystemLibraryVideoArtifactRemovalAdapterMock.mockImplementation(() => ({
      cleanupVideoArtifacts: vi.fn(async () => ({})),
    }));
    SqliteLibraryVideoMutationAdapterMock.mockImplementation(() => ({
      deleteLibraryVideo: vi.fn(async () => ({
        deleted: true,
        title: 'Catalog Fixture',
      })),
      findLibraryVideoById: vi.fn(async videoId => ({
        ...createCatalogVideo(),
        id: videoId,
      })),
      updateLibraryVideo: vi.fn(async input => ({
        ...createCatalogVideo(),
        contentTypeSlug: input.contentTypeSlug,
        genreSlugs: input.genreSlugs,
        id: input.videoId,
        tags: input.tags,
        title: input.title,
      })),
    }));
    vi.resetModules();

    const { getServerLibraryServices } = await import('../../../app/composition/server/library');
    const first = getServerLibraryServices();
    const second = getServerLibraryServices();

    expect(first).toBe(second);
    expect(SqliteCanonicalVideoMetadataAdapterMock).toHaveBeenCalledOnce();
    expect(SqliteLibraryVideoMutationAdapterMock).toHaveBeenCalledOnce();
    expect(FilesystemLibraryVideoArtifactRemovalAdapterMock).toHaveBeenCalledOnce();
    await expect(first.loadLibraryCatalogSnapshot.execute({
      rawQuery: '',
      rawIncludeTags: [],
      viewer: {
        type: 'anonymous',
      },
    })).resolves.toEqual({
      ok: true,
      data: {
        videos: [
          expect.objectContaining({
            id: 'video-1',
          }),
        ],
        filters: {
          contentTypeSlug: undefined,
          displayQuery: '',
          excludeTags: [],
          genreSlugs: [],
          includeTags: [],
          normalizedQuery: '',
        },
        vocabulary: {
          contentTypes: contentTypesFixture,
          genres: genresFixture,
        },
      },
    });
    expect(listLibraryVideos).toHaveBeenCalledWith({
      type: 'public_only',
    });
  });

  test('library composition root does not import retiring compatibility seam files', async () => {
    const source = await readFile(resolve(process.cwd(), 'app/composition/server/library.ts'), 'utf8');

    expect(source.includes('./canonical-video-metadata-legacy-store')).toBe(false);
    expect(source.includes('./library-legacy-video-mutation')).toBe(false);
  });

  test('retired library compatibility seam files no longer exist on disk', async () => {
    await expect(access(resolve(process.cwd(), 'app/composition/server/canonical-video-metadata-legacy-store.ts'))).rejects.toBeDefined();
    await expect(access(resolve(process.cwd(), 'app/composition/server/library-legacy-video-mutation.ts'))).rejects.toBeDefined();
  });
});
