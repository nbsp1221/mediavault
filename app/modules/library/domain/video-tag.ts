import { z } from 'zod';

export const MAX_VIDEO_TAG_LENGTH = 100;
export const MAX_VIDEO_TAGS = 100;
const INVALID_TAG_TEXT = /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u;

/** Tags are text, not path slugs. Use the same NFC/case/space key for tags and search. */
export function normalizeVideoSearchText(text: string): string {
  return text.normalize('NFC').toLowerCase().normalize('NFC').trim().replace(/\s+/g, ' ');
}

export const videoTagSchema = z
  .string({ error: 'Each tag must be text.' })
  .refine(
    (tag) => !INVALID_TAG_TEXT.test(tag),
    'Tags cannot contain control characters, line breaks, or malformed Unicode.',
  )
  .transform(normalizeVideoSearchText)
  .refine((tag) => tag.length > 0, 'Tags cannot be blank.')
  .refine(
    (tag) => Array.from(tag).length <= MAX_VIDEO_TAG_LENGTH,
    `Tags must be at most ${MAX_VIDEO_TAG_LENGTH} characters.`,
  );

export const videoTagsSchema = z
  .array(videoTagSchema, { error: 'Tags must be a list of text labels.' })
  .transform((tags) => [...new Set(tags)])
  .refine((tags) => tags.length <= MAX_VIDEO_TAGS, `Use at most ${MAX_VIDEO_TAGS} tags.`);

export function normalizeVideoTag(rawTag: string): string | null {
  const result = videoTagSchema.safeParse(rawTag);
  return result.success ? result.data : null;
}

/** Invalid labels are errors, never silently discarded or shortened. */
export function normalizeVideoTags(rawTags: string[]): string[] {
  const result = videoTagsSchema.safeParse(rawTags);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Invalid tags.');
  }
  return result.data;
}

export function formatVideoTagLabel(tag: string): string {
  return tag;
}
