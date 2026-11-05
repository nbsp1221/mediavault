import {
  type LibraryHomeFilters,
  type LibraryHomeFiltersInput,
  createLibraryHomeFilters,
} from '~/modules/library/domain/library-home-filters';
import {
  normalizeVideoSearchText,
  normalizeVideoTag,
  normalizeVideoTags,
} from '~/modules/library/domain/video-tag';
import {
  normalizeTaxonomySlug,
  normalizeTaxonomySlugs,
} from '~/modules/library/domain/video-taxonomy';

export interface HomeLibraryFilters {
  contentTypeSlug?: string;
  excludeTags: string[];
  genreSlugs: string[];
  includeTags: string[];
  query: string;
}

const FILTER_QUERY_PARAM = 'q';
const FILTER_INCLUDE_TAG_PARAM = 'tag';
const FILTER_EXCLUDE_TAG_PARAM = 'notTag';
const FILTER_CONTENT_TYPE_PARAM = 'type';
const FILTER_GENRE_PARAM = 'genre';

export function createHomeLibraryFilters(
  initialFilters?: Partial<HomeLibraryFilters>,
): HomeLibraryFilters {
  const contentTypeSlug = initialFilters?.contentTypeSlug
    ? (normalizeTaxonomySlug(initialFilters.contentTypeSlug) ?? undefined)
    : undefined;

  return {
    contentTypeSlug,
    excludeTags: normalizeVideoTags(initialFilters?.excludeTags ?? []),
    genreSlugs: normalizeTaxonomySlugs(initialFilters?.genreSlugs ?? []),
    includeTags: normalizeVideoTags(initialFilters?.includeTags ?? []),
    query: initialFilters?.query ?? '',
  };
}

export function normalizeHomeLibraryQuery(query: string) {
  return normalizeVideoSearchText(query);
}

export function normalizeHomeLibraryTags(tags: string[]) {
  return normalizeVideoTags(tags).sort();
}

export function areHomeLibraryTagsEquivalent(a: string, b: string) {
  return normalizeVideoTag(a) === normalizeVideoTag(b);
}

export function toLibraryHomeFilters(filters: HomeLibraryFilters): LibraryHomeFilters {
  const normalizedFilters = createHomeLibraryFilters(filters);
  const input: LibraryHomeFiltersInput = {
    rawContentTypeSlug: normalizedFilters.contentTypeSlug,
    rawExcludeTags: normalizedFilters.excludeTags,
    rawGenreSlugs: normalizedFilters.genreSlugs,
    rawIncludeTags: normalizedFilters.includeTags,
    rawQuery: normalizedFilters.query,
  };

  return createLibraryHomeFilters(input);
}

export function getHomeLibraryActiveFilterCount(filters: HomeLibraryFilters): number {
  const normalizedFilters = createHomeLibraryFilters(filters);

  return [
    normalizedFilters.query.trim().length > 0,
    ...normalizedFilters.includeTags,
    ...normalizedFilters.excludeTags,
    normalizedFilters.contentTypeSlug,
    ...normalizedFilters.genreSlugs,
  ].filter(Boolean).length;
}

export function hasHomeLibraryActiveFilters(filters: HomeLibraryFilters): boolean {
  return getHomeLibraryActiveFilterCount(filters) > 0;
}

export function clearHomeLibraryFilters(
  filters: HomeLibraryFilters,
  options: { preserveQuery?: boolean } = {},
): HomeLibraryFilters {
  return createHomeLibraryFilters({
    query: options.preserveQuery ? filters.query : '',
  });
}

export function writeHomeLibraryFiltersToSearchParams(
  searchParams: URLSearchParams,
  filters: HomeLibraryFilters,
): URLSearchParams {
  const nextParams = new URLSearchParams(searchParams);
  const normalizedFilters = createHomeLibraryFilters(filters);

  if (normalizedFilters.query.trim().length > 0) {
    nextParams.set(FILTER_QUERY_PARAM, normalizedFilters.query);
  } else {
    nextParams.delete(FILTER_QUERY_PARAM);
  }

  nextParams.delete(FILTER_INCLUDE_TAG_PARAM);
  normalizedFilters.includeTags.forEach((tag) => nextParams.append(FILTER_INCLUDE_TAG_PARAM, tag));

  nextParams.delete(FILTER_EXCLUDE_TAG_PARAM);
  normalizedFilters.excludeTags.forEach((tag) => nextParams.append(FILTER_EXCLUDE_TAG_PARAM, tag));

  nextParams.delete(FILTER_CONTENT_TYPE_PARAM);
  if (normalizedFilters.contentTypeSlug) {
    nextParams.set(FILTER_CONTENT_TYPE_PARAM, normalizedFilters.contentTypeSlug);
  }

  nextParams.delete(FILTER_GENRE_PARAM);
  normalizedFilters.genreSlugs.forEach((genre) => nextParams.append(FILTER_GENRE_PARAM, genre));

  return nextParams;
}

export function areHomeLibraryFiltersEqual(a: HomeLibraryFilters, b: HomeLibraryFilters) {
  if (normalizeHomeLibraryQuery(a.query) !== normalizeHomeLibraryQuery(b.query)) {
    return false;
  }

  if ((a.contentTypeSlug ?? '') !== (b.contentTypeSlug ?? '')) {
    return false;
  }

  const aIncludeTags = normalizeHomeLibraryTags(a.includeTags);
  const bIncludeTags = normalizeHomeLibraryTags(b.includeTags);
  const aExcludeTags = normalizeHomeLibraryTags(a.excludeTags);
  const bExcludeTags = normalizeHomeLibraryTags(b.excludeTags);
  const aGenreSlugs = normalizeTaxonomySlugs(a.genreSlugs).sort();
  const bGenreSlugs = normalizeTaxonomySlugs(b.genreSlugs).sort();

  if (
    aIncludeTags.length !== bIncludeTags.length ||
    aExcludeTags.length !== bExcludeTags.length ||
    aGenreSlugs.length !== bGenreSlugs.length
  ) {
    return false;
  }

  return (
    aIncludeTags.every((tag, index) => tag === bIncludeTags[index]) &&
    aExcludeTags.every((tag, index) => tag === bExcludeTags[index]) &&
    aGenreSlugs.every((slug, index) => slug === bGenreSlugs[index])
  );
}

export function toggleHomeLibraryTag(tags: string[], tag: string) {
  const canonicalTag = normalizeVideoTag(tag);

  if (!canonicalTag) {
    return tags;
  }

  return tags.some((existing) => areHomeLibraryTagsEquivalent(existing, tag))
    ? tags.filter((existing) => !areHomeLibraryTagsEquivalent(existing, tag))
    : [...tags, canonicalTag];
}
