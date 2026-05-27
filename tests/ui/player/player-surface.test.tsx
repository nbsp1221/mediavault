import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import type { PlaybackCatalogVideo } from '../../../app/modules/playback/application/ports/video-catalog.port';
import { PlayerSurface } from '../../../app/widgets/player-surface/ui/PlayerSurface';

interface MockProtectedPlaybackSessionState {
  drmConfig: null;
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
  onProviderChange: ((detail: unknown) => void) | null;
} => ({
  configureDashPlaybackProvider: vi.fn(),
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

function createVideo(overrides: Partial<PlaybackCatalogVideo> = {}): PlaybackCatalogVideo {
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

function renderPlayerSurface(props?: {
  relatedVideos?: PlaybackCatalogVideo[];
  video?: PlaybackCatalogVideo;
}) {
  const user = userEvent.setup();

  render(
    <MemoryRouter>
      <PlayerSurface
        relatedVideos={props?.relatedVideos ?? []}
        video={props?.video ?? createVideo()}
      />
    </MemoryRouter>,
  );

  return { user };
}

describe('PlayerSurface', () => {
  test('renders playback errors without mounting the media provider', () => {
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: 'Could not prepare the playback token.',
      isLoading: false,
      manifestUrl: null,
      token: null,
    };

    renderPlayerSurface();

    expect(screen.getByText('Playback error')).toBeInTheDocument();
    expect(screen.getByText('Could not prepare the playback token.')).toBeInTheDocument();
    expect(screen.queryByTestId('media-player')).not.toBeInTheDocument();
  });

  test('keeps the player context tree mounted while protected playback is still bootstrapping', () => {
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: null,
      isLoading: true,
      manifestUrl: null,
      token: null,
    };

    renderPlayerSurface({
      video: createVideo({ videoUrl: '/videos/video-1/manifest.mpd' }),
    });

    expect(screen.getByTestId('media-player')).toBeInTheDocument();
    expect(screen.getByTestId('media-provider')).toBeInTheDocument();
    expect(screen.getByTestId('default-video-layout')).toBeInTheDocument();
    expect(screen.getByText('Preparing secure playback')).toBeInTheDocument();
  });

  test('shows the loading shell when playback is not loading but has no manifest yet', () => {
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: null,
      isLoading: false,
      manifestUrl: null,
      token: null,
    };

    renderPlayerSurface();

    expect(screen.getByTestId('media-player')).toHaveAttribute('data-player-src', '');
    expect(screen.getByText('Preparing secure playback')).toBeInTheDocument();
  });

  test('wires DASH providers with the current DRM configuration and token', async () => {
    const dashProvider = {
      isDash: true,
      library: undefined as unknown,
      onInstance: vi.fn(async (callback: (provider: unknown) => Promise<void>) => {
        await callback({ id: 'dash-provider' });
      }),
    };
    protectedPlaybackSessionState.current = {
      drmConfig: {
        key: 'clear-key',
        keyId: 'clear-key-id',
      } as never,
      error: null,
      isLoading: false,
      manifestUrl: 'https://cdn.example.com/video-1.mpd',
      token: 'token-1',
    };

    renderPlayerSurface();

    await providerHarness.onProviderChange?.(dashProvider);

    expect(dashProvider.onInstance).toHaveBeenCalled();
    expect(providerHarness.configureDashPlaybackProvider).toHaveBeenCalledWith({
      drmConfig: {
        key: 'clear-key',
        keyId: 'clear-key-id',
      },
      provider: { id: 'dash-provider' },
      token: 'token-1',
    });
  });

  test('keeps the watch page content-first without decorative product labels', () => {
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: null,
      isLoading: false,
      manifestUrl: 'https://cdn.example.com/video-1.mpd',
      token: null,
    };

    renderPlayerSurface({
      relatedVideos: [
        createVideo({
          id: 'related-visual',
          tags: ['beta'],
          thumbnailUrl: '/api/thumbnail/related-visual',
          title: 'Related visual fixture',
          videoUrl: 'https://cdn.example.com/related-visual.mpd',
        }),
      ],
      video: createVideo({ title: 'Watch page fixture' }),
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Watch page fixture' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /related videos/i })).toBeInTheDocument();
    expect(screen.queryByText(/protected playback/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/vault player/i)).not.toBeInTheDocument();
  });

  test('formats fractional durations without leaking decimals', () => {
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: null,
      isLoading: false,
      manifestUrl: 'https://cdn.example.com/video-1.mpd',
      token: null,
    };

    renderPlayerSurface({
      relatedVideos: [
        createVideo({
          duration: 10.216009,
          id: 'related-1',
          tags: ['beta'],
          thumbnailUrl: '/api/thumbnail/related-1',
          title: 'Related decimal video',
          videoUrl: 'https://cdn.example.com/related-1.mpd',
        }),
      ],
      video: createVideo({ duration: 58.916667 }),
    });

    expect(screen.getByText('0:58')).toBeInTheDocument();
    expect(screen.getByText('0:10')).toBeInTheDocument();
    expect(screen.queryByText('0:58.916667')).not.toBeInTheDocument();
    expect(screen.queryByText('0:10.216009')).not.toBeInTheDocument();
  });

  test('formats invalid durations as 0:00', () => {
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: null,
      isLoading: false,
      manifestUrl: 'https://cdn.example.com/video-1.mpd',
      token: null,
    };

    renderPlayerSurface({
      relatedVideos: [
        createVideo({
          duration: -1,
          id: 'related-invalid',
          tags: ['beta'],
          thumbnailUrl: '/api/thumbnail/related-invalid',
          title: 'Invalid related duration',
          videoUrl: 'https://cdn.example.com/related-invalid.mpd',
        }),
      ],
      video: createVideo({ duration: Number.NaN }),
    });

    expect(screen.getAllByText('0:00')).toHaveLength(2);
  });

  test('shows a clear-filter affordance and explanatory empty state for tag filtering', async () => {
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: null,
      isLoading: false,
      manifestUrl: 'https://cdn.example.com/video-1.mpd',
      token: null,
    };

    const { user } = renderPlayerSurface({
      relatedVideos: [
        createVideo({
          id: 'related-beta',
          tags: ['beta'],
          thumbnailUrl: '/api/thumbnail/related-beta',
          title: 'Beta only related video',
          videoUrl: 'https://cdn.example.com/related-beta.mpd',
        }),
      ],
      video: createVideo({ tags: ['alpha'] }),
    });

    await user.click(screen.getByRole('button', { name: '#alpha' }));

    expect(screen.getAllByRole('button', { name: /clear filter/i }).length).toBeGreaterThan(0);
    const emptyDescription = screen.getByText(/No related videos match #alpha/i);

    expect(emptyDescription).toBeInTheDocument();
    expect(emptyDescription.tagName.toLowerCase()).toBe('p');
    expect(document.querySelector('[data-slot="empty"]')).not.toBeInTheDocument();
  });

  test('resets the active tag filter when the current video changes', async () => {
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: null,
      isLoading: false,
      manifestUrl: 'https://cdn.example.com/video-1.mpd',
      token: null,
    };

    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryRouter>
        <PlayerSurface
          relatedVideos={[
            createVideo({
              id: 'related-alpha',
              tags: ['alpha'],
              thumbnailUrl: '/api/thumbnail/related-alpha',
              title: 'Alpha related video',
              videoUrl: 'https://cdn.example.com/related-alpha.mpd',
            }),
          ]}
          video={createVideo({ tags: ['alpha'] })}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getAllByRole('button', { name: '#alpha' })[0]);
    expect(screen.getAllByRole('button', { name: /clear filter/i }).length).toBeGreaterThan(0);

    rerender(
      <MemoryRouter>
        <PlayerSurface
          relatedVideos={[
            createVideo({
              id: 'related-gamma',
              tags: ['gamma'],
              thumbnailUrl: '/api/thumbnail/related-gamma',
              title: 'Gamma related video',
              videoUrl: 'https://cdn.example.com/related-gamma.mpd',
            }),
            createVideo({
              id: 'related-delta',
              tags: ['delta'],
              thumbnailUrl: '/api/thumbnail/related-delta',
              title: 'Delta related video',
              videoUrl: 'https://cdn.example.com/related-delta.mpd',
            }),
          ]}
          video={createVideo({
            id: 'video-2',
            tags: ['gamma'],
            title: 'Second fixture video',
            videoUrl: 'https://cdn.example.com/video-2.mpd',
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /clear filter/i })).not.toBeInTheDocument();
    expect(screen.getByText('Gamma related video')).toBeInTheDocument();
    expect(screen.getByText('Delta related video')).toBeInTheDocument();
  });

  test('renders related-video cards with thumbnails, duration badges, and tag chips', () => {
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: null,
      isLoading: false,
      manifestUrl: 'https://cdn.example.com/video-1.mpd',
      token: null,
    };

    renderPlayerSurface({
      relatedVideos: [
        createVideo({
          duration: 125.7,
          id: 'related-rich',
          tags: ['beta', 'gamma', 'delta'],
          thumbnailUrl: '/api/thumbnail/related-rich',
          title: 'Rich related card',
          videoUrl: 'https://cdn.example.com/related-rich.mpd',
        }),
      ],
    });

    expect(screen.getByAltText('Rich related card')).toBeInTheDocument();
    expect(screen.getByText('2:05')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#beta' })).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  test('renders recommendation entries as thumbnail-first links with compact metadata', () => {
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: null,
      isLoading: false,
      manifestUrl: 'https://cdn.example.com/video-1.mpd',
      token: null,
    };

    const expectedDate = new Intl.DateTimeFormat('en-US').format(new Date('2026-03-08T00:00:00.000Z'));

    renderPlayerSurface({
      relatedVideos: [
        createVideo({
          createdAt: new Date('2026-03-08T00:00:00.000Z'),
          id: 'related-compact',
          tags: ['beta', 'gamma'],
          thumbnailUrl: '/api/thumbnail/related-compact',
          title: 'Compact related row',
          videoUrl: 'https://cdn.example.com/related-compact.mpd',
        }),
      ],
    });

    const relatedLink = screen.getByRole('link', { name: /compact related row/i });

    expect(relatedLink).toContainElement(within(relatedLink).getByAltText('Compact related row'));
    expect(relatedLink).toContainElement(within(relatedLink).getByText('Compact related row'));
    expect(relatedLink).toContainElement(within(relatedLink).getByText(expectedDate));
  });
});
