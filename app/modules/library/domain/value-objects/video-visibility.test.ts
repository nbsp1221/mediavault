import { describe, expect, test } from 'vitest';
import {
  createVideoVisibility,
  isPrivateVisibility,
  isPublicVisibility,
} from './video-visibility';

describe('VideoVisibility', () => {
  test('accepts only public and private', () => {
    expect(createVideoVisibility('public')).toEqual({
      ok: true,
      visibility: 'public',
    });
    expect(createVideoVisibility('private')).toEqual({
      ok: true,
      visibility: 'private',
    });
  });

  test.each([
    ['missing', undefined],
    ['null', null],
    ['empty string', ''],
    ['unknown string', 'restricted'],
    ['wrong casing', 'PUBLIC'],
    ['boolean', true],
    ['number', 1],
    ['array', ['public']],
    ['object', { visibility: 'public' }],
  ])('rejects %s visibility input', (_label, value) => {
    expect(createVideoVisibility(value)).toEqual({
      ok: false,
      reason: 'VIDEO_VISIBILITY_INVALID',
    });
  });

  test('checks public and private states', () => {
    expect(isPublicVisibility('public')).toBe(true);
    expect(isPublicVisibility('private')).toBe(false);
    expect(isPrivateVisibility('private')).toBe(true);
    expect(isPrivateVisibility('public')).toBe(false);
  });
});
