import { Film, Lock, Play } from 'lucide-react';
import { Link } from 'react-router';
import type { Playlist } from '~/entities/playlist/model/playlist';
import { playlistPlaybackHref } from '~/entities/playlist/model/playlist';
import { AspectRatio } from '~/shared/ui/aspect-ratio';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';

export function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const firstVideo = playlist.videoIds[0];
  return (
    <article className="flex min-w-0 flex-col gap-3">
      <div className="relative overflow-hidden rounded-lg bg-muted">
        <Link
          aria-label={`Open ${playlist.name}`}
          className="block focus-visible:ring-2 focus-visible:ring-ring"
          to={`/playlists/${encodeURIComponent(playlist.id)}`}
        >
          <AspectRatio ratio={16 / 9}>
            {playlist.thumbnailUrl ? (
              <img
                alt=""
                className="size-full object-cover"
                loading="lazy"
                src={playlist.thumbnailUrl}
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <Film aria-hidden className="size-12 text-muted-foreground" />
              </div>
            )}
          </AspectRatio>
        </Link>
        {firstVideo ? (
          <Button asChild className="absolute bottom-3 left-3" size="sm">
            <Link
              aria-label={`Play ${playlist.name}`}
              to={playlistPlaybackHref(playlist.id, firstVideo)}
            >
              <Play data-icon="inline-start" />
              Play all
            </Link>
          </Button>
        ) : null}
        <Badge className="absolute right-3 bottom-3" variant="secondary">
          {playlist.videoIds.length} videos
        </Badge>
      </div>
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 font-semibold">
          <Link
            className="break-words hover:underline"
            to={`/playlists/${encodeURIComponent(playlist.id)}`}
          >
            {playlist.name}
          </Link>
        </h2>
        {!playlist.isPublic ? (
          <Badge variant="outline">
            <Lock aria-hidden className="size-3" />
            Private
          </Badge>
        ) : null}
      </div>
      {playlist.description ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">{playlist.description}</p>
      ) : null}
    </article>
  );
}
