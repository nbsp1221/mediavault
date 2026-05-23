import { describe, expect, test } from 'vitest';
import { createVideoId } from './video-id';

describe('createVideoId', () => {
  test('accepts a trimmed video id', () => {
    expect(createVideoId(' video-1 ')).toEqual({
      ok: true,
      videoId: 'video-1',
    });
  });

  test('rejects missing and unsafe video ids', () => {
    expect(createVideoId('   ')).toEqual({
      ok: false,
      reason: 'VIDEO_ID_REQUIRED',
    });
    expect(createVideoId('../video')).toEqual({
      ok: false,
      reason: 'VIDEO_ID_UNSAFE',
    });
    expect(createVideoId('video/..')).toEqual({
      ok: false,
      reason: 'VIDEO_ID_UNSAFE',
    });
    expect(createVideoId('..')).toEqual({
      ok: false,
      reason: 'VIDEO_ID_UNSAFE',
    });
    expect(createVideoId('video/name')).toEqual({
      ok: false,
      reason: 'VIDEO_ID_UNSAFE',
    });
    expect(createVideoId('video\\name')).toEqual({
      ok: false,
      reason: 'VIDEO_ID_UNSAFE',
    });
    expect(createVideoId('video\0name')).toEqual({
      ok: false,
      reason: 'VIDEO_ID_UNSAFE',
    });
  });
});
