import { describe, expect, test } from 'vitest';
import { createVideoTitle } from './video-title';

describe('createVideoTitle', () => {
  test('trims and accepts non-empty titles', () => {
    expect(createVideoTitle('  My Video  ')).toEqual({
      ok: true,
      title: 'My Video',
    });
  });

  test('rejects empty titles', () => {
    expect(createVideoTitle('   ')).toEqual({
      ok: false,
      reason: 'VIDEO_TITLE_REQUIRED',
    });
  });
});
