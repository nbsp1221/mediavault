import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import type { PlaybackCatalogVideo } from '~/modules/playback/application/ports/video-catalog.port';
import type { PlayerPlaylistContext } from '~/pages/player/model/usePlaylistPlayback';
import type { ProtectedPlaybackSession } from '~/pages/player/model/useProtectedPlaybackSession';
import { PlayerSurface } from '~/pages/player/ui/PlayerSurface';

const protectedPlaybackSessionState = vi.hoisted<{ current: ProtectedPlaybackSession }>(() => ({
  current: {
    error: null,
    isLoading: false,
    licenseUrl: '/videos/video-1/clearkey',
    manifestUrl: '/videos/video-1/manifest.mpd',
    token: 'test-playback-token',
  },
}));
const playbackHarness = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));

vi.mock('~/pages/player/model/useProtectedPlaybackSession', () => ({
  useProtectedPlaybackSession: () => protectedPlaybackSessionState.current,
}));
vi.mock('~/pages/player/ui/SecureVideo', () => ({
  SecureVideo: ({
    title,
    manifestUrl,
    onEnded,
  }: {
    title: string;
    manifestUrl: string;
    onEnded?: () => void;
  }) => {
    useEffect(() => {
      playbackHarness.mounts++;
      return () => {
        playbackHarness.unmounts++;
      };
    }, []);
    return (
      <div data-player-src={manifestUrl} data-testid="media-player">
        <video aria-label={title} />
        <button onClick={onEnded} type="button">
          Finish video
        </button>
      </div>
    );
  },
}));

export function createVideo(overrides: Partial<PlaybackCatalogVideo> = {}): PlaybackCatalogVideo {
  return {
    createdAt: new Date('2026-03-09T00:00:00.000Z'),
    description: 'A playback regression fixture.',
    duration: 90,
    id: 'video-1',
    tags: ['vault', 'alpha'],
    thumbnailUrl: '/api/thumbnail/video-1',
    title: 'Primary fixture video',
    videoUrl: '/videos/video-1/manifest.mpd',
    ...overrides,
  };
}

interface SurfaceProps {
  playlist?: PlayerPlaylistContext;
  relatedVideos?: PlaybackCatalogVideo[];
  video?: PlaybackCatalogVideo;
}

export function renderPlayerSurface(props?: SurfaceProps) {
  const user = userEvent.setup();
  return { ...render(createPlayerSurfaceElement(props)), user };
}

export function createPlayerSurfaceElement(props?: SurfaceProps) {
  return (
    <MemoryRouter>
      <PlayerSurface
        playlist={props?.playlist}
        relatedVideos={props?.relatedVideos ?? []}
        video={props?.video ?? createVideo()}
      />
    </MemoryRouter>
  );
}

export { protectedPlaybackSessionState, playbackHarness };
