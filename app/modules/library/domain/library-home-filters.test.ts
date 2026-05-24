import { describe, expect, test } from 'vitest';
import type { LibraryVideo } from './library-video';
import {
  createLibraryHomeFilters,
  doesLibraryVideoMatchHomeFilters,
} from './library-home-filters';

function createHomeFilterVideo(overrides: Partial<LibraryVideo> = {}): LibraryVideo {
  return {
    createdAt: new Date('2026-04-24T00:00:00.000Z'),
    duration: 120,
    id: 'video-1',
    ownerId: 'owner-1',
    tags: ['visible'],
    title: 'Visible title',
    videoUrl: '/videos/video-1/manifest.mpd',
    visibility: 'private',
    ...overrides,
  };
}

describe('createLibraryHomeFilters', () => {
  test('preserves display query text while normalizing filter values for matching', () => {
    const filters = createLibraryHomeFilters({
      rawQuery: '  MiXeD Case Query  ',
      rawContentTypeSlug: ' Movie ',
      rawExcludeTags: ['Spoiler', 'low quality'],
      rawGenreSlugs: ['Action', 'Action', 'Drama!'],
      rawIncludeTags: ['Good Boy-comedy', 'magic'],
    });

    expect(filters.displayQuery).toBe('  MiXeD Case Query  ');
    expect(filters.normalizedQuery).toBe('mixed case query');
    expect(filters.includeTags).toEqual(['good_boy-comedy', 'magic']);
    expect(filters.excludeTags).toEqual(['spoiler', 'low_quality']);
    expect(filters.contentTypeSlug).toBe('movie');
    expect(filters.genreSlugs).toEqual(['action', 'drama']);
  });

  test('keeps empty structured filters distinct from explicit other', () => {
    const filters = createLibraryHomeFilters({
      rawQuery: '',
      rawContentTypeSlug: '',
      rawGenreSlugs: [],
      rawIncludeTags: [],
    });

    expect(filters.contentTypeSlug).toBeUndefined();
    expect(filters.genreSlugs).toEqual([]);

    const explicitOther = createLibraryHomeFilters({
      rawContentTypeSlug: 'other',
      rawGenreSlugs: ['other'],
    });

    expect(explicitOther.contentTypeSlug).toBe('other');
    expect(explicitOther.genreSlugs).toEqual(['other']);
  });

  test('matches query against title and tags only', () => {
    const filters = createLibraryHomeFilters({
      rawQuery: 'secret',
    });

    expect(doesLibraryVideoMatchHomeFilters(createHomeFilterVideo({
      contentTypeSlug: 'movie',
      description: 'Secret description should not match',
      genreSlugs: ['drama'],
      id: 'video-1',
    }), filters)).toBe(false);

    expect(doesLibraryVideoMatchHomeFilters(createHomeFilterVideo({
      contentTypeSlug: 'movie',
      description: 'Plain description',
      genreSlugs: ['drama'],
      id: 'video-2',
      tags: ['secret_tag'],
      videoUrl: '/videos/video-2/manifest.mpd',
    }), filters)).toBe(true);
  });

  test('applies include tag AND, exclude tag ANY, content type exact, and genre ANY semantics', () => {
    const filters = createLibraryHomeFilters({
      rawContentTypeSlug: 'movie',
      rawExcludeTags: ['spoiler'],
      rawGenreSlugs: ['drama', 'action'],
      rawIncludeTags: ['magic', 'comedy'],
    });

    const matchingVideo = createHomeFilterVideo({
      contentTypeSlug: 'movie',
      genreSlugs: ['documentary', 'drama'],
      id: 'video-1',
      tags: ['magic', 'comedy'],
      title: 'Fixture',
    });

    expect(doesLibraryVideoMatchHomeFilters(matchingVideo, filters)).toBe(true);
    expect(doesLibraryVideoMatchHomeFilters({
      ...matchingVideo,
      id: 'video-missing-include',
      tags: ['magic'],
    }, filters)).toBe(false);
    expect(doesLibraryVideoMatchHomeFilters({
      ...matchingVideo,
      id: 'video-excluded',
      tags: ['magic', 'comedy', 'spoiler'],
    }, filters)).toBe(false);
    expect(doesLibraryVideoMatchHomeFilters({
      ...matchingVideo,
      contentTypeSlug: 'clip',
      id: 'video-wrong-type',
    }, filters)).toBe(false);
    expect(doesLibraryVideoMatchHomeFilters({
      ...matchingVideo,
      genreSlugs: ['animation'],
      id: 'video-wrong-genre',
    }, filters)).toBe(false);
  });
});
