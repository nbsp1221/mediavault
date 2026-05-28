import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('useProtectedPlaybackSession', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('clears the previous protected session before bootstrapping a new video source', async () => {
    const { useProtectedPlaybackSession } = await import('../../../app/widgets/player-surface/model/useProtectedPlaybackSession');
    const renderSnapshots: Array<{
      manifestUrl: string | null;
      token: string | null;
      videoId: string;
    }> = [];

    let bootstrapCall = 0;
    fetchMock.mockImplementation(async () => {
      bootstrapCall += 1;

      if (bootstrapCall === 1) {
        return new Response(JSON.stringify({
          success: true,
          token: 'token-a',
          urls: {
            clearkey: '/videos/video-a/clearkey',
            manifest: '/videos/video-a/manifest.mpd',
          },
        }));
      }

      if (bootstrapCall === 2) {
        return new Response(JSON.stringify({
          keys: [{ k: 'key-a', kid: 'kid-a' }],
        }));
      }

      return new Promise<Response>(() => {});
    });

    const { result, rerender } = renderHook(
      ({ videoId, videoUrl }) => {
        const session = useProtectedPlaybackSession({
          enabled: true,
          refreshIntervalMs: 1000,
          videoId,
          videoUrl,
        });

        renderSnapshots.push({
          manifestUrl: session.manifestUrl,
          token: session.token,
          videoId,
        });

        return session;
      },
      {
        initialProps: {
          videoId: 'video-a',
          videoUrl: '/videos/video-a/manifest.mpd',
        },
      },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current).toEqual({
      drmConfig: {
        key: 'key-a',
        keyId: 'kid-a',
      },
      error: null,
      isLoading: false,
      manifestUrl: '/videos/video-a/manifest.mpd',
      token: 'token-a',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/videos/video-a/clearkey', {
      credentials: 'include',
      headers: {
        Authorization: 'Bearer token-a',
      },
    });

    renderSnapshots.length = 0;

    act(() => {
      rerender({
        videoId: 'video-b',
        videoUrl: '/videos/video-b/manifest.mpd',
      });
    });

    expect(renderSnapshots).not.toContainEqual({
      manifestUrl: '/videos/video-a/manifest.mpd',
      token: 'token-a',
      videoId: 'video-b',
    });
    expect(result.current).toEqual({
      drmConfig: null,
      error: null,
      isLoading: true,
      manifestUrl: null,
      token: null,
    });
  });

  test('refreshes the protected playback token and drm session before expiry', async () => {
    const { useProtectedPlaybackSession } = await import('../../../app/widgets/player-surface/model/useProtectedPlaybackSession');

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        token: 'token-1',
        urls: {
          clearkey: '/videos/video-1/clearkey',
          manifest: '/videos/video-1/manifest.mpd',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        keys: [{ k: 'key-1', kid: 'kid-1' }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        token: 'token-2',
        urls: {
          clearkey: '/videos/video-1/clearkey',
          manifest: '/videos/video-1/manifest.mpd',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        keys: [{ k: 'key-2', kid: 'kid-2' }],
      })));

    const { result } = renderHook(() => useProtectedPlaybackSession({
      enabled: true,
      refreshIntervalMs: 1000,
      videoId: 'video-1',
      videoUrl: '/videos/video-1/manifest.mpd',
    }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.token).toBe('token-1');
    expect(result.current.manifestUrl).toBe('/videos/video-1/manifest.mpd');
    expect(result.current.drmConfig).toEqual({
      key: 'key-1',
      keyId: 'kid-1',
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.token).toBe('token-2');
    expect(result.current.manifestUrl).toBe('/videos/video-1/manifest.mpd');
    expect(result.current.drmConfig).toEqual({
      key: 'key-2',
      keyId: 'kid-2',
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test('keeps retrying refresh after a transient failure and recovers a later token rotation', async () => {
    const { useProtectedPlaybackSession } = await import('../../../app/widgets/player-surface/model/useProtectedPlaybackSession');

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        token: 'token-1',
        urls: {
          clearkey: '/videos/video-1/clearkey',
          manifest: '/videos/video-1/manifest.mpd',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        keys: [{ k: 'key-1', kid: 'kid-1' }],
      })))
      .mockRejectedValueOnce(new Error('transient token outage'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        token: 'token-2',
        urls: {
          clearkey: '/videos/video-1/clearkey',
          manifest: '/videos/video-1/manifest.mpd',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        keys: [{ k: 'key-2', kid: 'kid-2' }],
      })));

    const { result } = renderHook(() => useProtectedPlaybackSession({
      enabled: true,
      refreshIntervalMs: 1000,
      videoId: 'video-1',
      videoUrl: '/videos/video-1/manifest.mpd',
    }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.token).toBe('token-1');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current).toEqual({
      drmConfig: {
        key: 'key-1',
        keyId: 'kid-1',
      },
      error: null,
      isLoading: false,
      manifestUrl: '/videos/video-1/manifest.mpd',
      token: 'token-1',
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current).toEqual({
      drmConfig: {
        key: 'key-2',
        keyId: 'kid-2',
      },
      error: null,
      isLoading: false,
      manifestUrl: '/videos/video-1/manifest.mpd',
      token: 'token-2',
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
