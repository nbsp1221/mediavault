import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useEffect } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import type { PlaybackCatalogVideo } from '../../../app/modules/playback/application/ports/video-catalog.port';
import { PlayerSurface } from '../../../app/widgets/player-surface/ui/PlayerSurface';

export interface MockProtectedPlaybackSessionState {
  drmConfig: {
    readonly key: string;
    readonly keyId: string;
  } | null;
  error: string | null;
  isLoading: boolean;
  manifestUrl: string | null;
  token: string | null;
}

const protectedPlaybackSessionState = vi.hoisted<{ current: MockProtectedPlaybackSessionState }>(() => ({
  current: {
    drmConfig: null,
    error: null,
    isLoading: false,
    manifestUrl: 'https://cdn.example.com/video-1.mpd',
    token: null,
  },
}));

const providerHarness = vi.hoisted((): {
  configureDashPlaybackProvider: ReturnType<typeof vi.fn>;
  mediaPlayerMounts: number;
  mediaPlayerUnmounts: number;
  onProviderChange: ((detail: unknown) => void) | null;
} => ({
  configureDashPlaybackProvider: vi.fn(),
  mediaPlayerMounts: 0,
  mediaPlayerUnmounts: 0,
  onProviderChange: null,
}));

vi.mock('@vidstack/react', () => ({
  MediaPlayer: ({
    children,
    onProviderChange,
    title,
    src,
  }: {
    children: ReactNode;
    onProviderChange?: (detail: unknown) => void;
    title: string;
    src?: string | null;
  }) => {
    providerHarness.onProviderChange = onProviderChange ?? null;
    useEffect(() => {
      providerHarness.mediaPlayerMounts += 1;

      return () => {
        providerHarness.mediaPlayerUnmounts += 1;
      };
    }, []);

    return (
      <div data-player-src={src ?? ''} data-testid="media-player">
        {title}
        {children}
      </div>
    );
  },
  MediaProvider: () => <div data-testid="media-provider" />,
  isDASHProvider: (detail: { isDash?: boolean } | null) => Boolean(detail?.isDash),
}));

vi.mock('@vidstack/react/player/layouts/default', () => ({
  defaultLayoutIcons: {},
  DefaultVideoLayout: () => <div data-testid="default-video-layout" />,
}));

vi.mock('../../../app/widgets/player-surface/model/useProtectedPlaybackSession', () => ({
  useProtectedPlaybackSession: () => protectedPlaybackSessionState.current,
}));

vi.mock('../../../app/widgets/player-surface/lib/configure-dash-playback-provider', () => ({
  configureDashPlaybackProvider: providerHarness.configureDashPlaybackProvider,
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
    videoUrl: 'https://cdn.example.com/video-1.mpd',
    ...overrides,
  };
}

export function renderPlayerSurface(props?: {
  relatedVideos?: PlaybackCatalogVideo[];
  video?: PlaybackCatalogVideo;
}) {
  const user = userEvent.setup();
  const renderResult = render(createPlayerSurfaceElement(props));

  return { ...renderResult, user };
}

export function createPlayerSurfaceElement(props?: {
  relatedVideos?: PlaybackCatalogVideo[];
  video?: PlaybackCatalogVideo;
}) {
  return (
    <MemoryRouter>
      <PlayerSurface
        relatedVideos={props?.relatedVideos ?? []}
        video={props?.video ?? createVideo()}
      />
    </MemoryRouter>
  );
}

export { protectedPlaybackSessionState, providerHarness };
