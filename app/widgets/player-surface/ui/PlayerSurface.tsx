import {
  type MediaPlayerInstance,
  type MediaProviderAdapter,
  isDASHProvider,
  MediaPlayer,
  MediaProvider,
} from '@vidstack/react';
import {
  defaultLayoutIcons,
  DefaultVideoLayout,
} from '@vidstack/react/player/layouts/default';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { PlaybackCatalogVideo } from '~/modules/playback/application/ports/video-catalog.port';
import { Button } from '~/shared/ui/button';
import { configureDashPlaybackProvider } from '../lib/configure-dash-playback-provider';
import { usePlayerSurfaceView } from '../model/usePlayerSurfaceView';
import { useProtectedPlaybackSession } from '../model/useProtectedPlaybackSession';
import { PlayerRelatedVideos } from './PlayerRelatedVideos';
import { PlayerVideoDetails } from './PlayerVideoDetails';

import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

interface PlayerSurfaceProps {
  relatedVideos: PlaybackCatalogVideo[];
  video: PlaybackCatalogVideo;
}

export function PlayerSurface({ video, relatedVideos }: PlayerSurfaceProps) {
  const {
    activeTag,
    clearTagFilter,
    createdAtLabel,
    durationLabel,
    filteredRelatedVideos,
    hasTagFilter,
    relatedEmptyMessage,
    tagItems,
    toggleTagFilter,
  } = usePlayerSurfaceView({ relatedVideos, video });

  return (
    <main className="min-h-screen bg-background">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Button asChild size="sm" variant="ghost">
              <Link to="/">
                <ArrowLeft />
                Library
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          <section className="flex flex-col gap-4 lg:col-span-2 lg:gap-6">
            <div className="overflow-hidden rounded-lg bg-black" data-testid="player-viewport">
              <PlaybackViewport video={video} />
            </div>

            <PlayerVideoDetails
              clearTagFilter={clearTagFilter}
              createdAtLabel={createdAtLabel}
              description={video.description}
              durationLabel={durationLabel}
              hasTagFilter={hasTagFilter}
              tagItems={tagItems}
              title={video.title}
              toggleTagFilter={toggleTagFilter}
            />
          </section>

          <PlayerRelatedVideos
            activeTag={activeTag}
            emptyMessage={relatedEmptyMessage}
            hasTagFilter={hasTagFilter}
            onClearTagFilter={clearTagFilter}
            onTagClick={toggleTagFilter}
            videos={filteredRelatedVideos}
          />
        </div>
      </div>
    </main>
  );
}

function PlaybackViewport({ video }: { video: PlaybackCatalogVideo }) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const {
    drmConfig,
    error,
    isLoading,
    manifestUrl,
    token,
  } = useProtectedPlaybackSession({
    enabled: isHydrated,
    videoId: video.id,
    videoUrl: video.videoUrl,
  });
  const providerConfigKey = `${video.id}:${token ?? 'public'}:${drmConfig?.keyId ?? 'clear'}`;

  const handleProviderChange = (detail: MediaProviderAdapter | null) => {
    if (!isDASHProvider(detail)) {
      return;
    }

    detail.library = async () => {
      const dashjs = await import('dashjs');
      const dashNamespace = ((dashjs as { default?: typeof import('dashjs') }).default ?? dashjs) as typeof import('dashjs');

      return {
        default: dashNamespace,
      };
    };

    detail.onInstance(async (provider) => {
      await configureDashPlaybackProvider({
        drmConfig,
        provider,
        token,
      });
    });
  };

  if (error) {
    return (
      <div className="flex aspect-video items-center justify-center bg-black p-6 text-center">
        <div className="flex max-w-sm flex-col gap-3">
          <div className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Playback error</div>
          <div className="text-lg font-semibold text-white">{error}</div>
        </div>
      </div>
    );
  }

  if (!isHydrated) {
    return <PlayerShell title={video.title} />;
  }

  const showLoadingOverlay = isLoading || !manifestUrl;

  return (
    <div className="relative aspect-video bg-black">
      <MediaPlayer
        key={providerConfigKey}
        ref={playerRef}
        className="h-full w-full !align-top bg-black text-white"
        load="eager"
        onProviderChange={handleProviderChange}
        playsInline
        src={manifestUrl ?? undefined}
        streamType="on-demand"
        title={video.title}
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>
      {showLoadingOverlay && (
        <div className="absolute inset-0 z-10">
          <PlayerShell title={video.title} />
        </div>
      )}
    </div>
  );
}

function PlayerShell({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-black px-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <div className="size-12 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <div className="text-xs uppercase tracking-[0.24em] text-slate-300">Preparing secure playback</div>
        <div className="text-lg font-semibold text-white">{title}</div>
      </div>
    </div>
  );
}
