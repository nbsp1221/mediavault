import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { PlaybackCatalogVideo } from '../../../app/modules/playback/application/ports/video-catalog.port';

const rootUserMock = vi.fn();

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => rootUserMock(),
}));

vi.mock('~/widgets/player-surface/ui/PlayerSurface', () => ({
  PlayerSurface: () => (
    <div data-testid="watch-surface">
      <div data-testid="player-viewport">Player viewport</div>
      <section aria-label="Video details">Video details</section>
      <aside aria-label="Related videos">Related videos</aside>
    </div>
  ),
}));

function createVideo(overrides: Partial<PlaybackCatalogVideo> = {}): PlaybackCatalogVideo {
  return {
    createdAt: new Date('2026-03-09T00:00:00.000Z'),
    description: 'A shell-backed player page fixture.',
    duration: 90,
    id: 'video-1',
    tags: ['vault'],
    title: 'Shell backed player fixture',
    videoUrl: 'https://cdn.example.com/video-1.mpd',
    ...overrides,
  };
}

describe('PlayerPage product shell', () => {
  beforeEach(() => {
    rootUserMock.mockReset();
    rootUserMock.mockReturnValue({ id: 'owner-1', role: 'admin', username: 'owner' });
  });

  test('renders the watch surface inside the product shell with Videos active', async () => {
    const { PlayerPage } = await import('../../../app/pages/player/ui/PlayerPage');

    render(
      <MemoryRouter initialEntries={['/player/video-1']}>
        <PlayerPage
          relatedVideos={[
            createVideo({
              id: 'related-1',
              tags: ['vault'],
              title: 'Related shell fixture',
              videoUrl: 'https://cdn.example.com/related-1.mpd',
            }),
          ]}
          video={createVideo()}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Shell backed player fixture' })).toBeInTheDocument();
    expect(screen.getByText(`1:30 • Added ${new Intl.DateTimeFormat('en-US').format(new Date('2026-03-09T00:00:00.000Z'))}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
    expect(screen.getByLabelText('Product sidebar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute('aria-current', 'page');
    expect(within(screen.getByRole('banner')).queryByText(/search/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /library/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('player-viewport')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /related videos/i })).toBeInTheDocument();
  });
});
