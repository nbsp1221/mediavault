import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PlaylistsPage } from '../../../app/pages/playlists/ui/PlaylistsPage';

const mockNavigate = vi.fn();

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => ({
    email: 'owner@example.com',
    id: 'owner-1',
    role: 'admin',
  }),
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('PlaylistsPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  test('renders the active shell and playlist list content', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter([
      {
        path: '/playlists',
        element: (
          <PlaylistsPage
            playlists={[{
              createdAt: new Date('2026-03-08T00:00:00.000Z'),
              id: 'playlist-1',
              isPublic: false,
              name: 'Vault',
              ownerId: 'owner-1',
              type: 'user_created',
              updatedAt: new Date('2026-03-08T00:00:00.000Z'),
              videoIds: ['video-1'],
            }]}
            videoCountMap={{ 'playlist-1': 1 }}
            total={1}
            searchQuery=""
            onSearchChange={() => {}}
          />
        ),
      },
      {
        path: '/api/playlists',
        action: async () => Response.json({ success: true }),
      },
    ], {
      initialEntries: ['/playlists'],
    });

    render(
      <RouterProvider router={router} />,
    );

    expect(screen.getByText('Mediavault')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Playlists' })).toBeInTheDocument();
    expect(screen.getByText('1 playlist')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'My Playlists' })).toBeInTheDocument();
    expect(screen.getByText('Vault')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /new playlist/i }));
    expect(screen.getByRole('dialog', { name: 'Create New Playlist' })).toBeInTheDocument();
  });

  test('navigates to playlist detail when the playlist card is selected', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter([
      {
        path: '/playlists',
        element: (
          <PlaylistsPage
            playlists={[{
              createdAt: new Date('2026-03-08T00:00:00.000Z'),
              id: 'playlist-1',
              isPublic: false,
              name: 'Vault',
              ownerId: 'owner-1',
              type: 'user_created',
              updatedAt: new Date('2026-03-08T00:00:00.000Z'),
              videoIds: ['video-1'],
            }]}
            videoCountMap={{ 'playlist-1': 1 }}
            total={1}
            searchQuery=""
            onSearchChange={() => {}}
          />
        ),
      },
      {
        path: '/api/playlists',
        action: async () => Response.json({ success: true }),
      },
    ], {
      initialEntries: ['/playlists'],
    });

    render(
      <RouterProvider router={router} />,
    );

    await user.click(screen.getByRole('button', { name: 'Vault' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/playlists/playlist-1');
    });
  });

  test('owns search updates by calling onSearchChange and navigating for search and clear flows', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();

    function SearchHarness() {
      const [searchQuery, setSearchQuery] = useState('');

      return (
        <PlaylistsPage
          playlists={[]}
          videoCountMap={{}}
          total={0}
          searchQuery={searchQuery}
          onSearchChange={(query) => {
            onSearchChange(query);
            setSearchQuery(query);
          }}
        />
      );
    }

    const router = createMemoryRouter([
      {
        path: '/playlists',
        element: <SearchHarness />,
      },
    ], {
      initialEntries: ['/playlists'],
    });

    render(
      <RouterProvider router={router} />,
    );

    const searchInput = screen.getByRole('searchbox', { name: 'Search playlists' });
    await user.type(searchInput, 'vault');

    expect(onSearchChange).toHaveBeenLastCalledWith('vault');
    expect(mockNavigate).toHaveBeenLastCalledWith('/playlists?q=vault');

    await user.clear(searchInput);

    expect(onSearchChange).toHaveBeenLastCalledWith('');
    expect(mockNavigate).toHaveBeenLastCalledWith('/playlists');
  });

  test('renders empty playlist copy when there are no playlists', () => {
    const router = createMemoryRouter([
      {
        path: '/playlists',
        element: (
          <PlaylistsPage
            playlists={[]}
            videoCountMap={{}}
            total={0}
            searchQuery=""
            onSearchChange={() => {}}
          />
        ),
      },
    ], {
      initialEntries: ['/playlists'],
    });

    render(
      <RouterProvider router={router} />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'My Playlists' })).toBeInTheDocument();
    expect(screen.getByText('No playlists yet')).toBeInTheDocument();
  });
});
