import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { PlaylistWithVideos } from '../../../app/entities/playlist/model/playlist';

const playlistDetailViewMock = vi.fn((props: unknown) => (
  <section data-testid="mock-playlist-detail-view">
    <pre>{JSON.stringify(props)}</pre>
  </section>
));

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => ({
    email: 'owner@example.com',
    id: 'owner-1',
    role: 'admin',
  }),
}));

function createPlaylistFixture(): PlaylistWithVideos {
  return {
    createdAt: new Date('2026-03-08T00:00:00.000Z'),
    description: 'Owned private playlist',
    id: 'playlist-1',
    isPublic: false,
    name: 'Vault',
    ownerId: 'owner-1',
    type: 'user_created',
    updatedAt: new Date('2026-03-08T00:00:00.000Z'),
    videoIds: ['video-1'],
    videos: [{
      duration: 90,
      id: 'video-1',
      position: 1,
      title: 'playtime',
    }],
  };
}

async function importPlaylistDetailPage() {
  return import('../../../app/pages/playlist-detail/ui/PlaylistDetailPage');
}

describe('PlaylistDetailPage', () => {
  afterEach(() => {
    playlistDetailViewMock.mockClear();
    vi.doUnmock('~/widgets/playlist-detail-view/ui/PlaylistDetailView');
    vi.resetModules();
  });

  test('forwards playlist detail props into the active view owner', async () => {
    vi.doMock('~/widgets/playlist-detail-view/ui/PlaylistDetailView', () => ({
      PlaylistDetailView: (props: unknown) => playlistDetailViewMock(props),
    }));

    const { PlaylistDetailPage } = await importPlaylistDetailPage();
    const playlist = createPlaylistFixture();
    const permissions = { canAddVideos: true, canDelete: true, canEdit: true, canShare: true };
    const relatedPlaylists: [] = [];
    const videoPagination = { hasMore: false, limit: 50, offset: 0, total: 1 };

    render(
      <MemoryRouter initialEntries={['/playlists/playlist-1']}>
        <PlaylistDetailPage
          playlist={playlist}
          stats={null}
          relatedPlaylists={relatedPlaylists}
          videoPagination={videoPagination}
          permissions={permissions}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Mediavault')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Browse' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Library' })).toBeInTheDocument();
    expect(screen.getByTestId('mock-playlist-detail-view')).toBeInTheDocument();
    expect(playlistDetailViewMock).toHaveBeenCalledWith({
      permissions,
      playlist,
      relatedPlaylists,
      stats: null,
      videoPagination,
    });
  });

  test('renders playlist detail content through the real detail view', async () => {
    const { PlaylistDetailPage } = await importPlaylistDetailPage();
    const playlist = createPlaylistFixture();

    render(
      <MemoryRouter initialEntries={['/playlists/playlist-1']}>
        <PlaylistDetailPage
          playlist={playlist}
          stats={null}
          relatedPlaylists={[]}
          videoPagination={{ hasMore: false, limit: 50, offset: 0, total: 1 }}
          permissions={{ canAddVideos: true, canDelete: true, canEdit: true, canShare: true }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Vault' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play All' })).toBeInTheDocument();
    expect(screen.getByText('Playlist Videos')).toBeInTheDocument();
    expect(screen.getByText('playtime')).toBeInTheDocument();
  });
});
