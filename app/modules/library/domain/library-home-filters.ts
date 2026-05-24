import type { LibraryVideo } from './library-video';
import { normalizeVideoTags } from './video-tag';
import { normalizeTaxonomySlug, normalizeTaxonomySlugs } from './video-taxonomy';

type FilterableLibraryVideo = Pick<
  LibraryVideo,
  'contentTypeSlug' | 'genreSlugs' | 'id' | 'tags' | 'title'
>;

export interface LibraryHomeFiltersInput {
  rawContentTypeSlug?: string | null;
  rawExcludeTags?: string[];
  rawGenreSlugs?: string[];
  rawIncludeTags?: string[];
  rawQuery?: string | null;
}

export interface LibraryHomeFilters {
  contentTypeSlug?: string;
  displayQuery: string;
  excludeTags: string[];
  genreSlugs: string[];
  includeTags: string[];
  normalizedQuery: string;
}

export function createLibraryHomeFilters(input: LibraryHomeFiltersInput): LibraryHomeFilters {
  const displayQuery = input.rawQuery ?? '';
  const normalizedQuery = displayQuery.trim().toLowerCase();
  const contentTypeSlug = input.rawContentTypeSlug
    ? normalizeTaxonomySlug(input.rawContentTypeSlug) ?? undefined
    : undefined;

  return {
    contentTypeSlug,
    displayQuery,
    excludeTags: normalizeVideoTags(input.rawExcludeTags ?? []),
    genreSlugs: normalizeTaxonomySlugs(input.rawGenreSlugs ?? []),
    includeTags: normalizeVideoTags(input.rawIncludeTags ?? []),
    normalizedQuery,
  };
}

export function doesLibraryVideoMatchHomeFilters(
  video: FilterableLibraryVideo,
  filters: LibraryHomeFilters,
): boolean {
  const normalizedVideoTags = normalizeVideoTags(video.tags);
  const normalizedVideoGenres = normalizeTaxonomySlugs(video.genreSlugs ?? []);
  const normalizedTitle = video.title.toLowerCase();
  const matchesQuery = filters.normalizedQuery.length === 0 ||
    normalizedTitle.includes(filters.normalizedQuery) ||
    normalizedVideoTags.some(tag => tag.includes(filters.normalizedQuery));

  if (!matchesQuery) {
    return false;
  }

  if (filters.includeTags.some(tag => !normalizedVideoTags.includes(tag))) {
    return false;
  }

  if (filters.excludeTags.some(tag => normalizedVideoTags.includes(tag))) {
    return false;
  }

  if (filters.contentTypeSlug && video.contentTypeSlug !== filters.contentTypeSlug) {
    return false;
  }

  if (
    filters.genreSlugs.length > 0 &&
    !filters.genreSlugs.some(slug => normalizedVideoGenres.includes(slug))
  ) {
    return false;
  }

  return true;
}
