import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PlaylistDetails } from '../../../app/features/playlist-management/api/playlist-api';
import { PlaylistDetailPage } from '../../../app/pages/playlist-detail/ui/PlaylistDetailPage';

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => ({ id: 'owner-1', username: 'owner' }),
}));
const video1 = { id: 'video-1', title: 'First video', duration: 60, position: 1 };
const video2 = { id: 'video-2', title: 'Second video', duration: 90, position: 2 };

function fixture(): PlaylistDetails {
  return {
    playlist: {
      id: 'playlist-1',
      name: 'Vault',
      description: 'A real collection',
      ownerId: 'owner-1',
      type: 'user_created',
      isPublic: true,
      createdAt: new Date('2026-05-01'),
      updatedAt: new Date('2026-05-02'),
      videoIds: ['video-1', 'video-2'],
      videos: [video1, video2],
      metadata: { genre: ['Travel'] },
    },
    permissions: { canEdit: true, canDelete: true, canAddVideos: true },
    videoPagination: { total: 2, limit: 50, offset: 0, hasMore: false },
    relatedPlaylists: [
      {
        id: 'related',
        name: 'Related collection',
        type: 'series',
        relationship: 'parent',
        videoCount: 3,
      },
    ],
  };
}

function renderPage(details = fixture()) {
  const router = createMemoryRouter(
    [
      { path: '/playlists/:id', element: <PlaylistDetailPage {...details} /> },
      { path: '/playlists', element: <p>Playlist catalog</p> },
    ],
    { initialEntries: ['/playlists/playlist-1'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const json = (value: object, status = 200) =>
  Response.json({ success: status < 400, ...value }, { status });

describe('Playlist detail workflows', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());
  test('renders accessible ordered playback links, genuine totals and related collections', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Vault' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play all' })).toHaveAttribute(
      'href',
      '/player/video-1?playlist=playlist-1',
    );
    expect(screen.getByRole('link', { name: 'Play Second video' })).toHaveAttribute(
      'href',
      '/player/video-2?playlist=playlist-1',
    );
    expect(screen.getByText('2 available videos')).toBeInTheDocument();
    expect(screen.getByText('2:30 total')).toBeInTheDocument();
    expect(screen.getByText('Travel')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Related collection/ })).toHaveAttribute(
      'href',
      '/playlists/related',
    );
    expect(screen.queryByText(/Popularity|Completion rate|coming soon/i)).not.toBeInTheDocument();
  });
  test('keeps public viewers read-only and handles an empty accessible queue', () => {
    const details = fixture();
    details.permissions = { canEdit: false, canDelete: false, canAddVideos: false };
    details.playlist.videoIds = [];
    details.playlist.videos = [];
    details.videoPagination = { total: 0, limit: 50, offset: 0, hasMore: false };
    renderPage(details);
    expect(screen.queryByRole('button', { name: 'Edit playlist' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete playlist' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Play all' })).not.toBeInTheDocument();
    expect(screen.getByText('No videos are available in this playlist.')).toBeInTheDocument();
  });
  test('reorders with the complete accessible queue and refreshes the visible order', async () => {
    const user = userEvent.setup();
    const next = fixture();
    next.playlist.videoIds = ['video-2', 'video-1'];
    next.playlist.videos = [video2, video1];
    vi.mocked(fetch).mockResolvedValueOnce(json({})).mockResolvedValueOnce(json(next));
    renderPage();
    expect(screen.getByRole('button', { name: 'Move First video up' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move Second video up' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/playlists/playlist-1/items',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ newOrder: ['video-2', 'video-1'] }),
      }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Playlist videos' })).getAllByRole('link')[0],
      ).toHaveAccessibleName('Play Second video'),
    );
  });
  test('removes only playlist membership and reloads the page data', async () => {
    const user = userEvent.setup();
    const next = fixture();
    next.playlist.videos = [video2];
    next.playlist.videoIds = ['video-2'];
    vi.mocked(fetch).mockResolvedValueOnce(json({})).mockResolvedValueOnce(json(next));
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Remove First video from playlist' }));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Play First video' })).not.toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/playlists/playlist-1/items/video-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
  test('loads additional videos and retries an error without losing loaded content', async () => {
    const user = userEvent.setup();
    const initial = fixture();
    initial.videoPagination = { total: 3, limit: 2, offset: 0, hasMore: true };
    const next = fixture();
    next.playlist.videos = [{ id: 'video-3', title: 'Third video', position: 3, duration: 20 }];
    next.playlist.videoIds = ['video-1', 'video-2', 'video-3'];
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ error: 'Temporary failure' }, 503))
      .mockResolvedValueOnce(json(next));
    renderPage(initial);
    await user.click(screen.getByRole('button', { name: 'Load more videos' }));
    expect(await screen.findByText('Temporary failure')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play First video' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more videos' }));
    expect(await screen.findByRole('link', { name: 'Play Third video' })).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/playlists/playlist-1?videoLimit=50&videoOffset=2',
      expect.any(Object),
    );
    expect(screen.queryByRole('button', { name: 'Load more videos' })).not.toBeInTheDocument();
  });
  test('edits real playlist details and refreshes the title after save', async () => {
    const user = userEvent.setup();
    const next = fixture();
    next.playlist.name = 'Updated vault';
    vi.mocked(fetch).mockResolvedValueOnce(json({})).mockResolvedValueOnce(json(next));
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Edit playlist' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit playlist' });
    await user.clear(within(dialog).getByRole('textbox', { name: 'Name' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Updated vault');
    await user.click(within(dialog).getByRole('button', { name: 'Save playlist' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Updated vault' }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/playlists/playlist-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          name: 'Updated vault',
          description: 'A real collection',
          isPublic: true,
        }),
      }),
    );
  });
  test('keeps destructive confirmation open on failure and navigates only after successful deletion', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ error: 'Delete failed' }, 500))
      .mockResolvedValueOnce(json({}));
    const router = renderPage();
    await user.click(screen.getByRole('button', { name: 'Delete playlist' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete playlist?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete playlist' }));
    expect(await within(dialog).findByText('Delete failed')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/playlists/playlist-1');
    await user.click(within(dialog).getByRole('button', { name: 'Delete playlist' }));
    expect(await screen.findByText('Playlist catalog')).toBeInTheDocument();
  });
});
