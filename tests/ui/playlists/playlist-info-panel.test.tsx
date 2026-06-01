import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import type { PlaylistWithVideos } from '../../../app/entities/playlist/model/playlist';
import { PlaylistInfoPanel } from '../../../app/widgets/playlist-detail-view/ui/PlaylistInfoPanel';

function createPlaylist(overrides: Partial<PlaylistWithVideos> = {}): PlaylistWithVideos {
  return {
    createdAt: new Date('2026-03-08T00:00:00.000Z'),
    description: 'A curated vault playlist.',
    id: 'playlist-1',
    isPublic: false,
    name: 'Vault Playlist',
    ownerId: 'owner-1234567890abcdef',
    thumbnailUrl: '/playlist.jpg',
    type: 'user_created',
    updatedAt: new Date('2026-03-09T00:00:00.000Z'),
    videoIds: ['video-1', 'video-2'],
    videos: [
      { duration: 90, id: 'video-1', position: 1, title: 'First video' },
      { duration: 120, id: 'video-2', position: 2, title: 'Second video' },
    ],
    ...overrides,
  };
}

function renderPanel(overrides: Partial<Parameters<typeof PlaylistInfoPanel>[0]> = {}) {
  const props: Parameters<typeof PlaylistInfoPanel>[0] = {
    formattedDates: {
      createdAt: 'Mar 8, 2026',
      updatedAt: 'Mar 9, 2026',
    },
    genreLabels: ['Action', 'Travel'],
    onEditDetails: vi.fn(),
    onPlayAll: vi.fn(),
    permissions: {
      canEdit: true,
    },
    playlist: createPlaylist(),
    relatedPlaylists: [{
      id: 'playlist-2',
      name: 'Related Vault',
      relationship: 'sibling',
      type: 'series',
      videoCount: 3,
    }],
    summaryItems: [
      { label: 'Videos', value: '2' },
      { label: 'Owner', value: 'owner-1' },
    ],
    totalDurationLabel: '3 minutes',
    ...overrides,
  };

  render(
    <MemoryRouter>
      <PlaylistInfoPanel {...props} />
    </MemoryRouter>,
  );

  return props;
}

describe('PlaylistInfoPanel', () => {
  test('renders playlist identity, status, summary, and related context', () => {
    renderPanel();

    expect(screen.getByRole('img', { name: 'Vault Playlist artwork' })).toHaveAttribute('src', '/playlist.jpg');
    expect(screen.getByRole('heading', { level: 2, name: 'Vault Playlist' })).toBeInTheDocument();
    expect(screen.getByText('A curated vault playlist.')).toBeInTheDocument();
    expect(screen.getByText('user created')).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
    expect(screen.getByText('Videos')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Total Duration')).toBeInTheDocument();
    expect(screen.getByText('3 minutes')).toBeInTheDocument();
    expect(screen.getByText('Last Updated')).toBeInTheDocument();
    expect(screen.getByText('Mar 9, 2026')).toBeInTheDocument();
    expect(screen.getByText('At a glance')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Travel')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Related Vault/ })).toHaveAttribute('href', '/playlists/playlist-2');
    expect(screen.getByText('sibling • 3 videos')).toBeInTheDocument();
    expect(screen.getByText('Owned by owner-…cdef')).toBeInTheDocument();
    expect(screen.getByText('Created Mar 8, 2026')).toBeInTheDocument();
  });

  test('invokes owner actions and hides edit when the user cannot edit', async () => {
    const user = userEvent.setup();
    const onPlayAll = vi.fn();
    const onEditDetails = vi.fn();
    const props = renderPanel({
      onEditDetails,
      onPlayAll,
      permissions: { canEdit: true },
      playlist: createPlaylist({
        isPublic: true,
        ownerId: 'short-owner',
        thumbnailUrl: undefined,
      }),
      relatedPlaylists: [],
    });

    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Vault Playlist artwork' })).not.toBeInTheDocument();
    expect(screen.getByText('Owned by short-owner')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Play All' }));
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(props.onPlayAll).toHaveBeenCalledOnce();
    expect(props.onEditDetails).toHaveBeenCalledOnce();

    cleanup();
    renderPanel({
      permissions: { canEdit: false },
      playlist: createPlaylist({ name: 'Read Only Playlist' }),
    });
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });
});
