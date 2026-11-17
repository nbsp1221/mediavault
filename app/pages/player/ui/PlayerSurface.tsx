import { SkipForward } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router';
import type { PlaybackCatalogVideo } from '~/modules/playback/application/ports/video-catalog.port';
import { usePlayerSurfaceView } from '~/pages/player/model/usePlayerSurfaceView';
import {
  type PlayerPlaylistContext,
  usePlaylistPlayback,
} from '~/pages/player/model/usePlaylistPlayback';
import { useProtectedPlaybackSession } from '~/pages/player/model/useProtectedPlaybackSession';
import { PlayerRelatedVideos } from '~/pages/player/ui/PlayerRelatedVideos';
import { PlayerVideoDetails } from '~/pages/player/ui/PlayerVideoDetails';
import { SecureVideo } from '~/pages/player/ui/SecureVideo';
import { Alert, AlertDescription, AlertTitle } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';

interface PlayerSurfaceProps {
  playlist?: PlayerPlaylistContext | null;
  relatedVideos: PlaybackCatalogVideo[];
  video: PlaybackCatalogVideo;
}

export function PlayerSurface({ playlist, video, relatedVideos }: PlayerSurfaceProps) {
  const view = usePlayerSurfaceView({ relatedVideos, video });
  const queue = usePlaylistPlayback(playlist, video.id);
  const navigationState: unknown = useLocation().state;
  const autoPlay =
    typeof navigationState === 'object' &&
    navigationState !== null &&
    'playlistAutoplay' in navigationState &&
    navigationState.playlistAutoplay === true;
  return (
    <div
      className="mx-auto flex w-full max-w-[104rem] flex-col gap-6 lg:gap-8"
      data-testid="watch-surface"
    >
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:items-start xl:gap-8">
        <section className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <div
            className="overflow-hidden rounded-xl bg-black shadow-sm ring-1 ring-border/70"
            data-testid="player-viewport"
          >
            <PlaybackViewport
              autoPlay={autoPlay}
              key={video.id}
              onEnded={() => {
                void queue.advance();
              }}
              video={video}
            />
          </div>
          {playlist ? (
            <section
              aria-label="Playlist queue"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <Link
                  className="truncate font-medium hover:underline"
                  to={`/playlists/${encodeURIComponent(playlist.id)}`}
                >
                  {playlist.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  Video {playlist.videoIds.indexOf(video.id) + 1} of {playlist.videoIds.length}
                </p>
                {queue.notice ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {queue.notice}
                  </p>
                ) : null}
              </div>
              <Button
                disabled={!queue.nextVideoId}
                onClick={() => {
                  void queue.advance();
                }}
                size="sm"
                variant="outline"
              >
                <SkipForward aria-hidden />
                Next video
              </Button>
            </section>
          ) : null}
          <PlayerVideoDetails
            clearTagFilter={view.clearTagFilter}
            createdAtLabel={view.createdAtLabel}
            description={video.description}
            durationLabel={view.durationLabel}
            hasTagFilter={view.hasTagFilter}
            tagItems={view.tagItems}
            title={video.title}
            toggleTagFilter={view.toggleTagFilter}
          />
        </section>
        <PlayerRelatedVideos
          activeTag={view.activeTag}
          emptyMessage={view.relatedEmptyMessage}
          hasTagFilter={view.hasTagFilter}
          onClearTagFilter={view.clearTagFilter}
          onTagClick={view.toggleTagFilter}
          videos={view.filteredRelatedVideos}
        />
      </div>
    </div>
  );
}

function PlaybackViewport({
  autoPlay,
  onEnded,
  video,
}: {
  autoPlay: boolean;
  onEnded: () => void;
  video: PlaybackCatalogVideo;
}) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const session = useProtectedPlaybackSession({ enabled: hydrated, videoId: video.id });
  if (session.error) {
    return (
      <div className="flex aspect-video items-center justify-center bg-background p-6">
        <Alert variant="destructive">
          <AlertTitle>Playback error</AlertTitle>
          <AlertDescription>{session.error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!hydrated || !session.manifestUrl || !session.licenseUrl || !session.token) {
    return (
      <div
        className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center text-white"
        role="status"
      >
        <p>Preparing secure playback</p>
        <p>{video.title}</p>
      </div>
    );
  }
  return (
    <SecureVideo
      autoPlay={autoPlay}
      licenseUrl={session.licenseUrl}
      manifestUrl={session.manifestUrl}
      onEnded={onEnded}
      title={video.title}
      token={session.token}
      videoId={video.id}
    />
  );
}

function subscribeToHydration() {
  return () => {};
}
