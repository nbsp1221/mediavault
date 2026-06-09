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
import { useRef, useSyncExternalStore } from 'react';
import type { PlaybackCatalogVideo } from '~/modules/playback/application/ports/video-catalog.port';
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
    <div
      className="mx-auto flex w-full max-w-[104rem] flex-col gap-6 lg:gap-8"
      data-testid="watch-surface"
    >
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:items-start xl:gap-8">
        <section className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <div
            className="overflow-hidden rounded-lg bg-black shadow-sm ring-1 ring-border/70"
            data-testid="player-viewport"
          >
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
  );
}

function PlaybackViewport({ video }: { video: PlaybackCatalogVideo }) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const isHydrated = useIsHydrated();

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
  const providerConfigKey = JSON.stringify([video.id, token, drmConfig?.keyId]);

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

function subscribeToHydration() {
  return () => {};
}

function getClientHydrationSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}

function useIsHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
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
