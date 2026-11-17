import { describe, expect, test, vi } from 'vitest';
import type { LibraryVideo } from '~/modules/library/domain/library-video';
import { SqliteCanonicalVideoMetadataAdapter } from '~/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter';

function fixture() {
  const videos = [
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
      visibility: 'public' as const,
    },
  ] satisfies LibraryVideo[];
  const repository = {
    findAllByReadAccessScope: vi.fn(async () => videos),
    findByIdByReadAccessScope: vi.fn(async () => videos[0] ?? null),
    listActiveContentTypes: vi.fn(async () => [
      { active: true, label: 'Movie', slug: 'movie', sortOrder: 10 },
    ]),
    listActiveGenres: vi.fn(async () => [
      { active: true, label: 'Documentary', slug: 'documentary', sortOrder: 40 },
    ]),
  };
  return { adapter: new SqliteCanonicalVideoMetadataAdapter({ repository }), repository, videos };
}

describe('canonical video metadata read adapter', () => {
  test.each([{ type: 'public_only' }, { ownerId: 'owner-1', type: 'public_or_owned' }] as const)(
    'forwards the complete $type read scope without changing access policy',
    async (scope) => {
      const f = fixture();
      await expect(f.adapter.listLibraryVideos(scope)).resolves.toEqual(f.videos);
      await expect(f.adapter.findLibraryVideoById('video-1', scope)).resolves.toMatchObject({
        id: 'video-1',
        title: 'Fixture Video',
      });
      expect(f.repository.findAllByReadAccessScope).toHaveBeenCalledWith(scope);
      expect(f.repository.findByIdByReadAccessScope).toHaveBeenCalledWith('video-1', scope);
    },
  );

  test('preserves active content-type and genre vocabulary reads', async () => {
    const f = fixture();
    await expect(f.adapter.listActiveContentTypes()).resolves.toEqual([
      { active: true, label: 'Movie', slug: 'movie', sortOrder: 10 },
    ]);
    await expect(f.adapter.listActiveGenres()).resolves.toEqual([
      { active: true, label: 'Documentary', slug: 'documentary', sortOrder: 40 },
    ]);
    expect(f.repository.listActiveContentTypes).toHaveBeenCalledOnce();
    expect(f.repository.listActiveGenres).toHaveBeenCalledOnce();
  });
});
