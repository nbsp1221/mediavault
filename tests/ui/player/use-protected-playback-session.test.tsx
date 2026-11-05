import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useProtectedPlaybackSession } from '~/pages/player/model/useProtectedPlaybackSession';

const fetchMock = vi.fn<typeof fetch>();

function tokenResponse(token = 'test-token-1', videoId = 'video-1') {
  return Response.json({
    success: true,
    token,
    urls: { manifest: `/videos/${videoId}/manifest.mpd`, clearkey: `/videos/${videoId}/clearkey` },
  });
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('renewable protected playback session', () => {
  test('requests only credentials; the engine owns the ClearKey POST exchange', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const { result } = renderHook(() =>
      useProtectedPlaybackSession({ enabled: true, videoId: 'video-1' }),
    );
    await flush();
    expect(result.current).toEqual({
      error: null,
      isLoading: false,
      manifestUrl: '/videos/video-1/manifest.mpd',
      licenseUrl: '/videos/video-1/clearkey',
      token: 'test-token-1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/videos/video-1/token',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
  test('refreshes in place without clearing the ready source', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(tokenResponse('test-token-2'));
    const { result } = renderHook(() =>
      useProtectedPlaybackSession({ enabled: true, refreshIntervalMs: 1000, videoId: 'video-1' }),
    );
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current).toMatchObject({
      error: null,
      isLoading: false,
      manifestUrl: '/videos/video-1/manifest.mpd',
      token: 'test-token-2',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  test('retains a working credential for transient refresh failure and retries', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(tokenResponse('test-token-2'));
    const { result } = renderHook(() =>
      useProtectedPlaybackSession({ enabled: true, refreshIntervalMs: 1000, videoId: 'video-1' }),
    );
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current).toMatchObject({ error: null, isLoading: false, token: 'test-token-1' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.token).toBe('test-token-2');
  });
  test.each([401, 403, 404])(
    'stops playback credentials after authoritative denial %i',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(new Response(null, { status }));
      const { result } = renderHook(() =>
        useProtectedPlaybackSession({ enabled: true, refreshIntervalMs: 1000, videoId: 'video-1' }),
      );
      await flush();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(result.current).toMatchObject({
        error: 'This video is no longer available.',
        isLoading: false,
        manifestUrl: null,
        licenseUrl: null,
        token: null,
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
  test('never exposes credentials from an old video during navigation or a late response', async () => {
    let resolveOld: ((response: Response) => void) | undefined;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(tokenResponse('test-token-b', 'video-b'));
    const { result, rerender } = renderHook(
      ({ videoId }) => useProtectedPlaybackSession({ enabled: true, videoId }),
      { initialProps: { videoId: 'video-a' } },
    );
    rerender({ videoId: 'video-b' });
    expect(result.current.token).toBeNull();
    await flush();
    expect(result.current.token).toBe('test-token-b');
    resolveOld?.(tokenResponse('test-token-a', 'video-a'));
    await flush();
    expect(result.current.token).toBe('test-token-b');
  });
  test.each([
    'https://untrusted.example/manifest.mpd',
    '/videos/other/manifest.mpd',
    '/videos/video-1/manifest.mpd?token=unexpected',
  ])('rejects out of scope entrypoint %s', async (manifest) => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        success: true,
        token: 'test-token',
        urls: { manifest, clearkey: '/videos/video-1/clearkey' },
      }),
    );
    const { result } = renderHook(() =>
      useProtectedPlaybackSession({ enabled: true, videoId: 'video-1' }),
    );
    await flush();
    expect(result.current).toMatchObject({
      error: 'Could not prepare secure playback. Please try again.',
      token: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  test('does not fetch during SSR hydration gating', () => {
    const { result } = renderHook(() =>
      useProtectedPlaybackSession({ enabled: false, videoId: 'video-1' }),
    );
    expect(result.current).toMatchObject({ isLoading: true, token: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test('aborts pending work and clears refresh timers on unmount', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const { unmount } = renderHook(() =>
      useProtectedPlaybackSession({ enabled: true, refreshIntervalMs: 1000, videoId: 'video-1' }),
    );
    await flush();
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  test('reports a failed initial bootstrap without an unbounded retry loop', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const { result } = renderHook(() =>
      useProtectedPlaybackSession({ enabled: true, videoId: 'video-1' }),
    );
    await flush();
    expect(result.current.error).toBe('Could not prepare secure playback. Please try again.');
    expect(vi.getTimerCount()).toBe(0);
  });
});
