export interface VideoTaxonomyItem {
  active: boolean;
  label: string;
  slug: string;
  sortOrder: number;
}

export const DEFAULT_VIDEO_CONTENT_TYPES: VideoTaxonomyItem[] = [
  { active: true, label: 'Movie', slug: 'movie', sortOrder: 10 },
  { active: true, label: 'Episode', slug: 'episode', sortOrder: 20 },
  { active: true, label: 'Home video', slug: 'home_video', sortOrder: 30 },
  { active: true, label: 'Clip', slug: 'clip', sortOrder: 40 },
  { active: true, label: 'Other', slug: 'other', sortOrder: 50 },
];

export const DEFAULT_VIDEO_GENRES: VideoTaxonomyItem[] = [
  { active: true, label: 'Action', slug: 'action', sortOrder: 10 },
  { active: true, label: 'Drama', slug: 'drama', sortOrder: 20 },
  { active: true, label: 'Comedy', slug: 'comedy', sortOrder: 30 },
  { active: true, label: 'Documentary', slug: 'documentary', sortOrder: 40 },
  { active: true, label: 'Animation', slug: 'animation', sortOrder: 50 },
  { active: true, label: 'Other', slug: 'other', sortOrder: 60 },
];

function isSlugLetterOrNumber(character: string | undefined): boolean {
  return Boolean(character && /[a-z0-9]/.test(character));
}

/** Controlled taxonomy identifiers remain ASCII slugs; free-form video tags do not. */
export function normalizeTaxonomySlug(rawSlug: string): string | null {
  const normalized = rawSlug
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_');
  const slug = Array.from(normalized)
    .filter(
      (character, index) =>
        character !== '_' ||
        (isSlugLetterOrNumber(normalized[index - 1]) &&
          isSlugLetterOrNumber(normalized[index + 1])),
    )
    .join('');
  return /[a-z0-9]/.test(slug) ? slug : null;
}

export function normalizeTaxonomySlugs(rawSlugs: string[]): string[] {
  return [...new Set(rawSlugs.map(normalizeTaxonomySlug).filter((slug) => slug !== null))];
}
