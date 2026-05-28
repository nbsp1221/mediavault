import { describe, expect, test, vi } from 'vitest';

import { authorizePlaybackResourceRead } from './authorize-playback-resource-read';

const authenticatedTokenPayload = {
  jti: 'token-1',
  readScope: 'public_or_owned' as const,
  subjectUserId: 'owner-1',
  videoId: 'video-1',
  viewerType: 'authenticated' as const,
};

describe('authorizePlaybackResourceRead', () => {
  test('denies missing tokens before scoped video reads', async () => {
    const videoRead = {
      findLibraryVideoById: vi.fn(),
    };

    await expect(authorizePlaybackResourceRead({
      resource: 'manifest',
      token: null,
      tokenService: {
        issue: async () => '',
        validate: async () => null,
      },
      videoId: 'video-1',
      videoRead,
    })).resolves.toEqual({
      metadata: {
        requestedVideoId: 'video-1',
        resource: 'manifest',
      },
      ok: false,
      reason: 'PLAYBACK_TOKEN_REQUIRED',
    });
    expect(videoRead.findLibraryVideoById).not.toHaveBeenCalled();
  });

  test('denies token video mismatches with the requested resource metadata', async () => {
    const videoRead = {
      findLibraryVideoById: vi.fn(),
    };

    await expect(authorizePlaybackResourceRead({
      resource: 'audio-segment',
      token: 'signed-token',
      tokenService: {
        issue: async () => '',
        validate: async () => ({ ...authenticatedTokenPayload, videoId: 'video-2' }),
      },
      videoId: 'video-1',
      videoRead,
    })).resolves.toEqual({
      metadata: {
        requestedVideoId: 'video-1',
        resource: 'audio-segment',
        tokenVideoId: 'video-2',
      },
      ok: false,
      reason: 'VIDEO_SCOPE_MISMATCH',
    });
    expect(videoRead.findLibraryVideoById).not.toHaveBeenCalled();
  });

  test('checks current read access after token validation', async () => {
    const videoRead = {
      findLibraryVideoById: vi.fn(async () => null),
    };

    await expect(authorizePlaybackResourceRead({
      resource: 'clearkey-license',
      token: 'signed-token',
      tokenService: {
        issue: async () => '',
        validate: async () => authenticatedTokenPayload,
      },
      videoId: 'video-1',
      videoRead,
    })).resolves.toEqual({
      metadata: {
        requestedVideoId: 'video-1',
        resource: 'clearkey-license',
      },
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });
    expect(videoRead.findLibraryVideoById).toHaveBeenCalledWith('video-1', {
      ownerId: 'owner-1',
      type: 'public_or_owned',
    });
  });

  test('allows the resource when token scope and current read access both match', async () => {
    const videoRead = {
      findLibraryVideoById: vi.fn(async () => ({} as never)),
    };

    await expect(authorizePlaybackResourceRead({
      resource: 'segment',
      token: 'signed-token',
      tokenService: {
        issue: async () => '',
        validate: async () => authenticatedTokenPayload,
      },
      videoId: 'video-1',
      videoRead,
    })).resolves.toEqual({
      ok: true,
    });
  });
});
