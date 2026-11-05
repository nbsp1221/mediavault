import { useEffect, useRef, useState } from 'react';
import {
  type PlaylistDetails,
  playlistDetailsSchema,
  playlistRequest,
} from '~/features/playlist-management/api/playlist-api';

/** Own the detail page's paginated reads and owner-only commands. */
export function usePlaylistDetails(initial: PlaylistDetails) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const generationRef = useRef({ active: true });
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setData(initial);
    setError(null);
  }
  useEffect(() => {
    const current = { active: true };
    generationRef.current = current;
    return () => {
      current.active = false;
    };
  }, [initial]);
  const endpoint = `/api/playlists/${encodeURIComponent(data.playlist.id)}`;

  const refresh = async () => {
    const version = generationRef.current;
    const result = await playlistRequest(
      `${endpoint}?videoLimit=${Math.min(100, Math.max(50, data.playlist.videos.length))}&videoOffset=0`,
      {},
      playlistDetailsSchema,
    );
    if (version.active && version === generationRef.current) {
      setData(result);
    }
  };

  const run = async (operation: () => Promise<void>) => {
    if (inFlightRef.current) {
      return false;
    }
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update the playlist.');
      return false;
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  const loadMore = () =>
    run(async () => {
      const version = generationRef.current;
      const result = await playlistRequest(
        `${endpoint}?videoLimit=50&videoOffset=${data.playlist.videos.length}`,
        {},
        playlistDetailsSchema,
      );
      if (!version.active || version !== generationRef.current) {
        return;
      }
      setData((previous) => ({
        ...result,
        playlist: {
          ...result.playlist,
          videos: [
            ...previous.playlist.videos,
            ...result.playlist.videos.filter(
              (video) => !previous.playlist.videos.some((existing) => existing.id === video.id),
            ),
          ],
        },
      }));
    });

  const remove = (videoId: string) =>
    run(async () => {
      await playlistRequest(`${endpoint}/items/${encodeURIComponent(videoId)}`, {
        method: 'DELETE',
      });
      await refresh();
    });

  const move = (videoId: string, direction: -1 | 1) =>
    run(async () => {
      const order = [...data.playlist.videoIds];
      const index = order.indexOf(videoId);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= order.length) {
        return;
      }
      [order[index], order[next]] = [order[next], order[index]];
      await playlistRequest(`${endpoint}/items`, {
        method: 'PUT',
        body: JSON.stringify({ newOrder: order }),
      });
      await refresh();
    });

  const deletePlaylist = () =>
    run(async () => {
      await playlistRequest(endpoint, { method: 'DELETE' });
    });

  const reload = () => run(refresh);

  return { data, busy, error, loadMore, remove, move, deletePlaylist, reload };
}
