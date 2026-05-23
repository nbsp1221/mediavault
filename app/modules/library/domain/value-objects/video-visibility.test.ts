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
    expect(createVideoVisibility('restricted')).toEqual({
      ok: false,
      reason: 'VIDEO_VISIBILITY_INVALID',
    });
    expect(createVideoVisibility(null)).toEqual({
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
