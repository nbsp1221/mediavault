import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Playlist } from '../../../app/entities/playlist/model/playlist';
import { PlaylistsPage } from '../../../app/pages/playlists/ui/PlaylistsPage';
import { createDeferred } from '../../helpers/create-deferred';

const viewer = vi.hoisted(() => ({
  user: { id: 'owner-1', username: 'owner' } as { id: string; username: string } | undefined,
}));
vi.mock('~/shared/hooks/use-root-user', () => ({ useRootUser: () => viewer.user }));
const playlist: Playlist = {
  id: 'playlist-1',
  name: 'Vault',
  ownerId: 'owner-1',
  isPublic: true,
  type: 'user_created',
  createdAt: new Date(),
  updatedAt: new Date(),
  videoIds: ['video-1'],
};

function renderPage(items = [playlist], hasMore = false) {
  const router = createMemoryRouter(
    [
      {
        path: '/playlists',
        element: (
          <PlaylistsPage hasMore={hasMore} playlists={items} searchQuery="" total={items.length} />
        ),
      },
      { path: '/playlists/:id', element: <p>Playlist destination</p> },
    ],
    { initialEntries: ['/playlists'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('Playlist catalog workflows', () => {
  beforeEach(() => {
    viewer.user = { id: 'owner-1', username: 'owner' };
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());
  test('renders actual detail and ordered playback links', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Playlists' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play Vault' })).toHaveAttribute(
      'href',
      '/player/video-1?playlist=playlist-1',
    );
    await user.click(screen.getByRole('link', { name: 'Open Vault' }));
    expect(await screen.findByText('Playlist destination')).toBeInTheDocument();
  });
  test('searches through the URL and clears the draft explicitly', async () => {
    const user = userEvent.setup();
    const router = renderPage();
    const input = screen.getByRole('searchbox', { name: 'Search playlists' });
    await user.type(input, 'vault');
    await user.click(screen.getByRole('button', { name: 'Search playlists' }));
    await waitFor(() => expect(router.state.location.search).toBe('?q=vault'));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });
  test('allows anonymous browsing without showing authenticated creation', () => {
    viewer.user = undefined;
    renderPage([]);
    expect(screen.getByText('No playlists available.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New playlist' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Playlists' }).length).toBeGreaterThan(0);
  });
  test('loads another page without duplicating existing cards', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        success: true,
        playlists: [playlist, { ...playlist, id: 'second', name: 'Second collection' }],
        hasMore: false,
        totalCount: 2,
      }),
    );
    renderPage([playlist], true);
    await user.click(screen.getByRole('button', { name: 'Load more playlists' }));
    expect(await screen.findByRole('link', { name: 'Open Second collection' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open Vault' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Load more playlists' })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/playlists?limit=20&offset=1', expect.any(Object));
  });
  test.each([0, 1])(
    'creates through desktop/mobile entry %i with explicit visibility and opens its detail page',
    async (entry) => {
      const user = userEvent.setup();
      vi.mocked(fetch).mockResolvedValueOnce(
        Response.json({ success: true, playlistId: 'new-playlist' }, { status: 201 }),
      );
      const router = renderPage();
      const creationEntries = screen.getAllByRole('button', { name: 'New playlist' });
      expect(creationEntries).toHaveLength(2);
      await user.click(creationEntries[entry]);
      const dialog = screen.getByRole('dialog', { name: 'New playlist' });
      await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'My collection');
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: 'Visibility' }),
        'public',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Create playlist' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/playlists/new-playlist'));
      expect(fetch).toHaveBeenCalledWith(
        '/api/playlists',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'My collection',
            description: '',
            isPublic: true,
            type: 'user_created',
          }),
        }),
      );
    },
  );
  test('ignores stale pagination results when URL search changes', async () => {
    const user = userEvent.setup();
    const pending = createDeferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const oldItems = [playlist];
    const newItems = [{ ...playlist, id: 'new', name: 'New collection' }];

    function SearchPage() {
      const query = new URLSearchParams(useLocation().search).get('q') ?? '';
      return (
        <PlaylistsPage
          hasMore
          playlists={query ? newItems : oldItems}
          searchQuery={query}
          total={2}
        />
      );
    }

    const router = createMemoryRouter([{ path: '/playlists', element: <SearchPage /> }], {
      initialEntries: ['/playlists'],
    });
    render(<RouterProvider router={router} />);
    await user.click(screen.getByRole('button', { name: 'Load more playlists' }));
    await act(async () => {
      await router.navigate('/playlists?q=new');
    });
    expect(screen.getByRole('link', { name: 'Open New collection' })).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await act(async () => {
      pending.resolve(
        Response.json({
          success: true,
          playlists: [{ ...playlist, id: 'stale', name: 'Stale collection' }],
          hasMore: false,
          totalCount: 2,
        }),
      );
    });
    expect(screen.queryByRole('link', { name: 'Open Stale collection' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more playlists' })).toBeEnabled();
  });

  test('keeps failed list pagination retryable', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Connection unavailable'));
    renderPage([playlist], true);
    await user.click(screen.getByRole('button', { name: 'Load more playlists' }));
    expect(await screen.findByText('Connection unavailable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Vault' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more playlists' })).toBeEnabled();
  });
});
