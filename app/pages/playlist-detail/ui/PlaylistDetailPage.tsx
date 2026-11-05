import { ArrowDown, ArrowUp, ListPlus, Pencil, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { PlaylistDetails } from '~/features/playlist-management/api/playlist-api';
import { playlistPlaybackHref } from '~/entities/playlist/model/playlist';
import { PlaylistEditorDialog } from '~/features/playlist-management/ui/PlaylistEditorDialog';
import { formatDisplayDate } from '~/shared/lib/format-display-date';
import { formatDuration } from '~/shared/lib/format-duration';
import { Alert, AlertDescription } from '~/shared/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import { ProductShell } from '~/widgets/product-shell/ui/ProductShell';
import { usePlaylistDetails } from '../model/usePlaylistDetails';

export function PlaylistDetailPage(props: PlaylistDetails) {
  const navigate = useNavigate();
  const view = usePlaylistDetails(props);
  const { playlist, permissions, videoPagination, relatedPlaylists } = view.data;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const firstVideo = playlist.videoIds[0];
  const loadedDuration = playlist.videos.reduce((sum, video) => sum + video.duration, 0);

  const removePlaylist = async () => {
    if (await view.deletePlaylist()) {
      void navigate('/playlists');
    }
  };

  return (
    <ProductShell
      actions={
        permissions.canEdit ? (
          <Button disabled={view.busy} onClick={() => setEditing(true)} size="sm" variant="outline">
            <Pencil data-icon="inline-start" />
            Edit playlist
          </Button>
        ) : undefined
      }
      activeRoute="playlists"
      contentWidth="wide"
      description={playlist.description}
      title={playlist.name}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">{playlist.isPublic ? 'Public' : 'Private'}</Badge>
          <span className="text-sm text-muted-foreground">
            {videoPagination?.total ?? playlist.videoIds.length} available videos
          </span>
          <span className="text-sm text-muted-foreground">
            {formatDuration(loadedDuration)}
            {videoPagination?.hasMore ? ' loaded' : ' total'}
          </span>
          <span className="text-sm text-muted-foreground">
            Updated {formatDisplayDate(new Date(playlist.updatedAt))}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Playlist visibility does not change access to individual videos.
        </p>
        {playlist.metadata?.genre?.length ? (
          <div className="flex flex-wrap gap-2">
            {playlist.metadata.genre.map((genre) => (
              <Badge key={genre} variant="outline">
                {genre}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {firstVideo ? (
            <Button asChild>
              <Link to={playlistPlaybackHref(playlist.id, firstVideo)}>
                <Play data-icon="inline-start" />
                Play all
              </Link>
            </Button>
          ) : null}
          {permissions.canAddVideos ? (
            <Button asChild variant="outline">
              <Link to="/">
                <ListPlus data-icon="inline-start" />
                Add videos from library
              </Link>
            </Button>
          ) : null}
          {permissions.canDelete ? (
            <Button disabled={view.busy} onClick={() => setDeleting(true)} variant="destructive">
              <Trash2 data-icon="inline-start" />
              Delete playlist
            </Button>
          ) : null}
        </div>
        {view.error ? (
          <Alert variant="destructive">
            <AlertDescription>{view.error}</AlertDescription>
          </Alert>
        ) : null}
        {playlist.videos.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">
            No videos are available in this playlist.
          </p>
        ) : (
          <ol aria-label="Playlist videos" className="flex flex-col divide-y divide-border">
            {playlist.videos.map((video) => {
              const index = playlist.videoIds.indexOf(video.id);
              return (
                <li
                  className="flex flex-wrap items-center gap-3 py-4 sm:flex-nowrap"
                  key={video.id}
                >
                  <Link
                    aria-label={`Play ${video.title}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                    to={playlistPlaybackHref(playlist.id, video.id)}
                  >
                    {video.thumbnailUrl ? (
                      <img
                        alt=""
                        className="aspect-video w-24 shrink-0 rounded-md object-cover sm:w-32"
                        loading="lazy"
                        src={video.thumbnailUrl}
                      />
                    ) : (
                      <Play aria-hidden className="size-8 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <h2 className="break-words font-medium">{video.title}</h2>
                      <p className="text-sm text-muted-foreground">
                        {formatDuration(video.duration)}
                      </p>
                    </div>
                  </Link>
                  {permissions.canEdit ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        aria-label={`Move ${video.title} up`}
                        disabled={view.busy || index === 0}
                        onClick={() => void view.move(video.id, -1)}
                        size="icon"
                        variant="outline"
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        aria-label={`Move ${video.title} down`}
                        disabled={view.busy || index === playlist.videoIds.length - 1}
                        onClick={() => void view.move(video.id, 1)}
                        size="icon"
                        variant="outline"
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        aria-label={`Remove ${video.title} from playlist`}
                        disabled={view.busy}
                        onClick={() => void view.remove(video.id)}
                        size="icon"
                        variant="outline"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {videoPagination?.hasMore ? (
          <Button
            className="self-center"
            disabled={view.busy}
            onClick={() => void view.loadMore()}
            variant="outline"
          >
            {view.busy ? 'Loading...' : 'Load more videos'}
          </Button>
        ) : null}
        {relatedPlaylists?.length ? (
          <nav aria-label="Related playlists" className="flex flex-col gap-2">
            <h2 className="font-semibold">Related playlists</h2>
            {relatedPlaylists.map((related) => (
              <Link
                className="underline"
                key={related.id}
                to={`/playlists/${encodeURIComponent(related.id)}`}
              >
                {related.name} · {related.videoCount} videos
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      {permissions.canEdit ? (
        <PlaylistEditorDialog
          initialValues={{
            name: playlist.name,
            description: playlist.description ?? '',
            isPublic: playlist.isPublic,
          }}
          onOpenChange={setEditing}
          onSaved={() => {
            void view.reload();
          }}
          open={editing}
          playlistId={playlist.id}
        />
      ) : null}
      <AlertDialog
        onOpenChange={(open) => {
          if (!view.busy) {
            setDeleting(open);
          }
        }}
        open={deleting}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete playlist?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes “{playlist.name}” and its ordering. The videos themselves will not be
              deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {view.error ? (
            <Alert variant="destructive">
              <AlertDescription>{view.error}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={view.busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={view.busy}
              onClick={(event) => {
                event.preventDefault();
                void removePlaylist();
              }}
              variant="destructive"
            >
              {view.busy ? 'Deleting...' : 'Delete playlist'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProductShell>
  );
}
