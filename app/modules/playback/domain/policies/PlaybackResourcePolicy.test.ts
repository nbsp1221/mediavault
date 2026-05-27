import { describe, expect, test } from 'vitest';

describe('PlaybackResourcePolicy', () => {
  test('allows manifest access when the playback token is scoped to the requested video', async () => {
    const { PlaybackResourcePolicy } = await import('./PlaybackResourcePolicy');

    const decision = PlaybackResourcePolicy.evaluate({
      requestedVideoId: 'video-1',
      requestedUserId: 'owner-1',
      resource: 'manifest',
      token: { userId: 'owner-1', videoId: 'video-1' },
    });

    expect(decision).toEqual({
      allowed: true,
      resource: 'manifest',
    });
  });

  test.each([
    'manifest',
    'segment',
    'audio-segment',
    'clearkey-license',
  ] as const)('denies %s access when no playback token is present', async (resource) => {
    const { PlaybackResourcePolicy } = await import('./PlaybackResourcePolicy');

    const decision = PlaybackResourcePolicy.evaluate({
      requestedVideoId: 'video-1',
      requestedUserId: 'owner-1',
      resource,
      token: null,
    });

    expect(decision).toEqual({
      allowed: false,
      metadata: {
        requestedVideoId: 'video-1',
        requestedUserId: 'owner-1',
        resource,
      },
      reason: 'PLAYBACK_TOKEN_REQUIRED',
    });
  });

  test('denies resource access when the playback token is bound to a different video', async () => {
    const { PlaybackResourcePolicy } = await import('./PlaybackResourcePolicy');

    const decision = PlaybackResourcePolicy.evaluate({
      requestedVideoId: 'video-2',
      requestedUserId: 'owner-1',
      resource: 'segment',
      token: { userId: 'owner-1', videoId: 'video-1' },
    });

    expect(decision).toEqual({
      allowed: false,
      metadata: {
        requestedVideoId: 'video-2',
        requestedUserId: 'owner-1',
        resource: 'segment',
        tokenVideoId: 'video-1',
        tokenUserId: 'owner-1',
      },
      reason: 'VIDEO_SCOPE_MISMATCH',
    });
  });

  test('denies resource access when the playback token is bound to a different user', async () => {
    const { PlaybackResourcePolicy } = await import('./PlaybackResourcePolicy');

    const decision = PlaybackResourcePolicy.evaluate({
      requestedVideoId: 'video-1',
      requestedUserId: 'owner-2',
      resource: 'manifest',
      token: { userId: 'owner-1', videoId: 'video-1' },
    });

    expect(decision).toEqual({
      allowed: false,
      metadata: {
        requestedVideoId: 'video-1',
        requestedUserId: 'owner-2',
        resource: 'manifest',
        tokenUserId: 'owner-1',
      },
      reason: 'USER_SCOPE_MISMATCH',
    });
  });
});
