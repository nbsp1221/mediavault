import { describe, expect, test } from 'vitest';

describe('playback video id contract', () => {
  test('accepts existing active playback ids', async () => {
    const { isValidPlaybackVideoId } = await import('./playback-video-id');

    expect(isValidPlaybackVideoId('video-1')).toBe(true);
    expect(isValidPlaybackVideoId('68e5f819-15e8-41ef-90ee-8a96769311b7')).toBe(true);
    expect(isValidPlaybackVideoId('video.1')).toBe(true);
    expect(isValidPlaybackVideoId('test_video-1')).toBe(true);
  });

  test('rejects unsafe playback ids', async () => {
    const { isValidPlaybackVideoId } = await import('./playback-video-id');

    expect(isValidPlaybackVideoId('')).toBe(false);
    expect(isValidPlaybackVideoId('../escape')).toBe(false);
    expect(isValidPlaybackVideoId('video/1')).toBe(false);
    expect(isValidPlaybackVideoId('video 1')).toBe(false);
    expect(isValidPlaybackVideoId('video\0id')).toBe(false);
    expect(isValidPlaybackVideoId('.hidden-video')).toBe(false);
    expect(isValidPlaybackVideoId('-video-1')).toBe(false);
    expect(isValidPlaybackVideoId('_video-1')).toBe(false);
    expect(isValidPlaybackVideoId('video-1!')).toBe(false);
    expect(isValidPlaybackVideoId('video-1\n')).toBe(false);
  });
});
