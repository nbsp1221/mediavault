import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';

export interface PlayerPlaylistContext {
  id: string;
  name: string;
  videoIds: string[];
}

const queueSchema = z.object({
  success: z.literal(true),
  playlist: z.object({ videoIds: z.array(z.string()) }),
});

export function usePlaylistPlayback(
  playlist: PlayerPlaylistContext | null | undefined,
  videoId: string,
) {
  const navigate = useNavigate();
  const pendingRef = useRef<AbortController | null>(null);
  const source = `${playlist?.id ?? ''}:${videoId}`;
  const [notice, setNotice] = useState<{ message: string; source: string } | null>(null);
  useEffect(
    () => () => {
      pendingRef.current?.abort();
      pendingRef.current = null;
    },
    [playlist?.id, videoId],
  );
  const advance = useCallback(async () => {
    if (!playlist || pendingRef.current) {
      return;
    }
    const abort = new AbortController();
    pendingRef.current = abort;
    try {
      const response = await fetch(`/api/playlists/${encodeURIComponent(playlist.id)}`, {
        credentials: 'include',
        signal: abort.signal,
      });
      if (!response.ok) {
        throw new Error('Playlist unavailable');
      }
      const result = queueSchema.parse(await response.json());
      if (abort.signal.aborted) {
        return;
      }
      const index = result.playlist.videoIds.indexOf(videoId);
      const nextId = index >= 0 ? result.playlist.videoIds[index + 1] : undefined;
      if (nextId) {
        await navigate(
          `/player/${encodeURIComponent(nextId)}?playlist=${encodeURIComponent(playlist.id)}`,
          { state: { playlistAutoplay: true } },
        );
      } else {
        setNotice({ message: 'End of playlist.', source });
      }
    } catch {
      if (!abort.signal.aborted) {
        setNotice({
          message: 'The playlist is no longer available. Playback has stopped.',
          source,
        });
      }
    } finally {
      if (pendingRef.current === abort) {
        pendingRef.current = null;
      }
    }
  }, [navigate, playlist, source, videoId]);
  const index = playlist?.videoIds.indexOf(videoId) ?? -1;
  return {
    advance,
    notice: notice?.source === source ? notice.message : null,
    nextVideoId: index >= 0 ? playlist?.videoIds[index + 1] : undefined,
  };
}
