import { describe, expect, test } from 'vitest';
import {
  MAX_VIDEO_TAGS,
  MAX_VIDEO_TAG_LENGTH,
  formatVideoTagLabel,
  normalizeVideoTag,
  normalizeVideoTags,
  videoTagsSchema,
} from './video-tag';

describe('Unicode text tag policy', () => {
  test('preserves Korean, punctuation, symbols, spaces, and existing ASCII underscores', () => {
    expect(
      normalizeVideoTags([
        ' 가족 여행 ',
        'C++',
        'Good/Boy!',
        '_good__boy_',
        'good - boy',
        '!!!',
        '👨‍👩‍👧‍👦',
      ]),
    ).toEqual(['가족 여행', 'c++', 'good/boy!', '_good__boy_', 'good - boy', '!!!', '👨‍👩‍👧‍👦']);
    expect(formatVideoTagLabel('good_boy-comedy')).toBe('good_boy-comedy');
    expect(formatVideoTagLabel('가족 여행 C++')).toBe('가족 여행 C++');
  });
  test('deduplicates NFC-equivalent and case-equivalent labels without conflating punctuation or underscores with spaces', () => {
    expect(
      normalizeVideoTags([
        ' Café ',
        'CAFE\u0301',
        '가족',
        '가족'.normalize('NFD'),
        '  Good   Boy  ',
        'good boy',
        'good_boy',
        'C++',
        'c',
      ]),
    ).toEqual(['café', '가족', 'good boy', 'good_boy', 'c++', 'c']);
  });
  test.each([
    '',
    '  ',
    'hello\u0000world',
    'line\nbreak',
    '\tlabel',
    '\u007f',
    '\u0085',
    '\u2028',
    '\u2029',
    '\ud800',
    '\udfff',
    '가'.repeat(MAX_VIDEO_TAG_LENGTH + 1),
  ])('rejects invalid tag %j rather than stripping or truncating it', (tag) => {
    expect(normalizeVideoTag(tag)).toBeNull();
    expect(() => normalizeVideoTags(['valid', tag])).toThrow();
  });
  test('counts normalized Unicode code points rather than UTF-16 units', () => {
    expect(normalizeVideoTag('😀'.repeat(MAX_VIDEO_TAG_LENGTH))).toBe(
      '😀'.repeat(MAX_VIDEO_TAG_LENGTH),
    );
    expect(normalizeVideoTag('😀'.repeat(MAX_VIDEO_TAG_LENGTH + 1))).toBeNull();
    expect(normalizeVideoTag('é'.normalize('NFD').repeat(MAX_VIDEO_TAG_LENGTH))).toBe(
      'é'.repeat(MAX_VIDEO_TAG_LENGTH),
    );
  });
  test('limits unique labels and permits duplicate input at the limit', () => {
    const tags = Array.from({ length: MAX_VIDEO_TAGS }, (_, index) => `태그 ${index}`);
    expect(normalizeVideoTags([...tags, tags[0]])).toEqual(tags);
    expect(() => normalizeVideoTags([...tags, 'extra'])).toThrow('Use at most 100 tags.');
  });
  test.each([null, 'label', [42], ['valid', null]].map((tags) => ({ tags })))(
    'rejects malformed raw input %j',
    ({ tags }) => {
      expect(videoTagsSchema.safeParse(tags).success).toBe(false);
    },
  );
});
