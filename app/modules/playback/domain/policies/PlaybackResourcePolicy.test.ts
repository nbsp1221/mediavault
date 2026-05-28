import { describe, expect, test } from 'vitest';

describe('PlaybackResourcePolicy', () => {
  const token = {
    readScope: 'public_or_owned' as const,
    subjectUserId: 'owner-1',
    videoId: 'video-1',
    viewerType: 'authenticated' as const,
  };

  test('allows manifest access when the playback token is scoped to the requested video', async () => {
    const { PlaybackResourcePolicy } = await import('./PlaybackResourcePolicy');

    const decision = PlaybackResourcePolicy.evaluate({
      requestedVideoId: 'video-1',
      resource: 'manifest',
      token,
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
      resource,
      token: null,
    });

    expect(decision).toEqual({
      allowed: false,
      metadata: {
        requestedVideoId: 'video-1',
        resource,
      },
      reason: 'PLAYBACK_TOKEN_REQUIRED',
    });
  });

  test('denies resource access when the playback token is bound to a different video', async () => {
    const { PlaybackResourcePolicy } = await import('./PlaybackResourcePolicy');

    const decision = PlaybackResourcePolicy.evaluate({
      requestedVideoId: 'video-2',
      resource: 'segment',
      token,
    });

    expect(decision).toEqual({
      allowed: false,
      metadata: {
        requestedVideoId: 'video-2',
        resource: 'segment',
        tokenVideoId: 'video-1',
      },
      reason: 'VIDEO_SCOPE_MISMATCH',
    });
  });

  test('allows resource access based on token video binding for anonymous public tokens', async () => {
    const { PlaybackResourcePolicy } = await import('./PlaybackResourcePolicy');

    const decision = PlaybackResourcePolicy.evaluate({
      requestedVideoId: 'video-1',
      resource: 'manifest',
      token: {
        readScope: 'public_only',
        videoId: 'video-1',
        viewerType: 'anonymous',
      },
    });

    expect(decision).toEqual({
      allowed: true,
      resource: 'manifest',
    });
  });
});
