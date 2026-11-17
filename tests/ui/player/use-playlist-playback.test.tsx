import type { ReactNode } from 'react';
import { act, renderHook, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { usePlaylistPlayback } from '~/pages/player/model/usePlaylistPlayback';

const fetchMock = vi.fn<typeof fetch>();

function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
      {JSON.stringify(location.state)}
    </output>
  );
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/player/video-1?playlist=queue-1']}>
      {children}
      <Location />
    </MemoryRouter>
  );
}

const playlist = {
  id: 'queue-1',
  name: 'Public queue',
  videoIds: ['video-1', 'video-2', 'video-3'],
};
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('playlist playback advancement', () => {
  test('revalidates the accessible queue, skips a removed next item, and preserves playlist/autoplay context', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, playlist: { videoIds: ['video-1', 'video-3'] } }),
    );
    const { result } = renderHook(() => usePlaylistPlayback(playlist, 'video-1'), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.advance();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/playlists/queue-1',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/player/video-3?playlist=queue-1');
    expect(screen.getByTestId('location')).toHaveTextContent('"playlistAutoplay":true');
  });
  test('stops at the final item instead of looping', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, playlist: { videoIds: ['video-1'] } }),
    );
    const { result } = renderHook(() => usePlaylistPlayback(playlist, 'video-1'), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.advance();
    });
    expect(result.current.notice).toBe('End of playlist.');
    expect(screen.getByTestId('location')).toHaveTextContent('/player/video-1?playlist=queue-1');
  });
  test('stops when the current item is no longer accessible instead of restarting at index zero', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, playlist: { videoIds: ['video-2', 'video-3'] } }),
    );
    const { result } = renderHook(() => usePlaylistPlayback(playlist, 'video-1'), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.advance();
    });
    expect(result.current.notice).toBe('End of playlist.');
    expect(screen.getByTestId('location')).not.toHaveTextContent('/player/video-2');
  });
  test.each([401, 403, 404, 500])(
    'never navigates on denied/unavailable playlist response %i',
    async (status) => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status }));
      const { result } = renderHook(() => usePlaylistPlayback(playlist, 'video-1'), {
        wrapper: Wrapper,
      });
      await act(async () => {
        await result.current.advance();
      });
      expect(result.current.notice).toContain('Playback has stopped');
      expect(screen.getByTestId('location')).toHaveTextContent('/player/video-1?playlist=queue-1');
    },
  );
  test('uses the complete queue beyond the first hundred items', async () => {
    const videoIds = Array.from({ length: 125 }, (_, index) => `video-${index}`);
    fetchMock.mockResolvedValueOnce(Response.json({ success: true, playlist: { videoIds } }));
    const { result } = renderHook(
      () => usePlaylistPlayback({ ...playlist, videoIds }, 'video-120'),
      { wrapper: Wrapper },
    );
    await act(async () => {
      await result.current.advance();
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/player/video-121?playlist=queue-1');
  });
  test('does not fetch when no playlist context exists', async () => {
    const { result } = renderHook(() => usePlaylistPlayback(null, 'video-1'), { wrapper: Wrapper });
    await act(async () => {
      await result.current.advance();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.nextVideoId).toBeUndefined();
  });
  test('cancels an old queue response after source navigation', async () => {
    let finish: ((response: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ videoId }) => usePlaylistPlayback(playlist, videoId),
      { initialProps: { videoId: 'video-1' }, wrapper: Wrapper },
    );
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.advance();
    });
    rerender({ videoId: 'video-3' });
    finish?.(Response.json({ success: true, playlist: { videoIds: playlist.videoIds } }));
    await act(async () => {
      await pending;
    });
    expect(screen.getByTestId('location')).not.toHaveTextContent('/player/video-2');
  });
});
