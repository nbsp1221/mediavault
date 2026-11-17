import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { Playlist } from '~/entities/playlist/model/playlist';
import { Alert, AlertDescription } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/shared/ui/dialog';
import { addVideoToPlaylist, listOwnedPlaylists } from '../api/playlist-api';

interface AddToPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string;
  videoTitle: string;
}

function OwnedPlaylistChoices({ videoId, onAdded }: { videoId: string; onAdded: () => void }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    listOwnedPlaylists(offset, controller.signal)
      .then((page) => {
        setPlaylists((previous) =>
          offset === 0
            ? page.playlists
            : [
                ...previous,
                ...page.playlists.filter(
                  (playlist) => !previous.some((item) => item.id === playlist.id),
                ),
              ],
        );
        setHasMore(page.hasMore);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Unable to load playlists.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [offset, reloadVersion]);

  const add = async (playlistId: string) => {
    if (adding) {
      return;
    }
    setAdding(playlistId);
    setError(null);
    try {
      await addVideoToPlaylist(playlistId, videoId);
      toast.success('Video added to playlist.');
      onAdded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add the video.');
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {loading && playlists.length === 0 ? <p role="status">Loading playlists...</p> : null}
      {!loading && playlists.length === 0 && !error ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Create a playlist before adding this video.
          </p>
          <Button asChild variant="outline">
            <Link to="/playlists">Manage playlists</Link>
          </Button>
        </div>
      ) : null}
      <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto" aria-label="Your playlists">
        {playlists.map((playlist) => (
          <li key={playlist.id}>
            <Button
              className="w-full justify-between"
              disabled={Boolean(adding) || playlist.videoIds.includes(videoId)}
              onClick={() => void add(playlist.id)}
              type="button"
              variant="outline"
            >
              <span className="truncate">{playlist.name}</span>
              <span>
                {playlist.videoIds.includes(videoId)
                  ? 'Already added'
                  : adding === playlist.id
                    ? 'Adding...'
                    : 'Add'}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <Button
          disabled={loading || Boolean(adding)}
          onClick={() => {
            setLoading(true);
            setError(null);
            setOffset((previous) => previous + 100);
          }}
          type="button"
          variant="outline"
        >
          {loading ? 'Loading...' : 'Load more playlists'}
        </Button>
      ) : null}
      {error && playlists.length === 0 ? (
        <Button
          onClick={() => {
            setLoading(true);
            setError(null);
            setReloadVersion((previous) => previous + 1);
          }}
          variant="outline"
        >
          Retry loading playlists
        </Button>
      ) : null}
    </div>
  );
}

export function AddToPlaylistDialog({
  open,
  onOpenChange,
  videoId,
  videoTitle,
}: AddToPlaylistDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to playlist</DialogTitle>
          <DialogDescription>{videoTitle}</DialogDescription>
        </DialogHeader>
        {open ? (
          <OwnedPlaylistChoices
            key={videoId}
            onAdded={() => onOpenChange(false)}
            videoId={videoId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
