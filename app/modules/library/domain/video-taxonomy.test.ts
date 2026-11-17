import { describe, expect, test } from 'vitest';
import {
  DEFAULT_VIDEO_CONTENT_TYPES,
  DEFAULT_VIDEO_GENRES,
  normalizeTaxonomySlug,
} from './video-taxonomy';

describe('video taxonomy helpers', () => {
  test('exposes the approved minimal bootstrap content types', () => {
    expect(DEFAULT_VIDEO_CONTENT_TYPES.map((item) => item.slug)).toEqual([
      'movie',
      'episode',
      'home_video',
      'clip',
      'other',
    ]);
  });

  test('exposes the approved minimal bootstrap genres', () => {
    expect(DEFAULT_VIDEO_GENRES.map((item) => item.slug)).toEqual([
      'action',
      'drama',
      'comedy',
      'documentary',
      'animation',
      'other',
    ]);
  });

  test('keeps taxonomy identifiers as controlled ASCII slugs, independent of text tags', () => {
    expect(normalizeTaxonomySlug('Home Video')).toBe('home_video');
    expect(normalizeTaxonomySlug('Drama!')).toBe('drama');
    expect(normalizeTaxonomySlug('!!!')).toBeNull();
  });
});
