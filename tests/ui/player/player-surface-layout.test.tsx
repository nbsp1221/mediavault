import { screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import {
  createPlayerSurfaceElement,
  createVideo,
  protectedPlaybackSessionState,
  renderPlayerSurface,
} from './player-surface-test-harness';

describe('PlayerSurface layout contracts', () => {
  test('renders as content-only watch surface inside ProductShell chrome', () => {
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

    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /library/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('watch-surface')).toBeInTheDocument();
    expect(screen.getByTestId('player-viewport')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /video details/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /related videos/i })).toBeInTheDocument();
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

    const { rerender, user } = renderPlayerSurface({
      relatedVideos: [
        createVideo({
          id: 'related-alpha',
          tags: ['alpha'],
          thumbnailUrl: '/api/thumbnail/related-alpha',
          title: 'Alpha related video',
          videoUrl: 'https://cdn.example.com/related-alpha.mpd',
        }),
      ],
      video: createVideo({ tags: ['alpha'] }),
    });

    await user.click(screen.getAllByRole('button', { name: '#alpha' })[0]);
    expect(screen.getAllByRole('button', { name: /clear filter/i }).length).toBeGreaterThan(0);

    rerender(createPlayerSurfaceElement({
      relatedVideos: [
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
      ],
      video: createVideo({
        id: 'video-2',
        tags: ['gamma'],
        title: 'Second fixture video',
        videoUrl: 'https://cdn.example.com/video-2.mpd',
      }),
    }));

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
