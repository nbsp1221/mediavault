import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { VideoDetailsView } from '../../../app/pages/video-details/ui/VideoDetailsView';

const viewer = vi.hoisted(() => ({
  user: { id: 'owner-1', username: 'owner' } as { id: string; username: string } | undefined,
}));
vi.mock('~/shared/hooks/use-root-user', () => ({ useRootUser: () => viewer.user }));

function createVideo(overrides: Partial<HomeLibraryVideo> = {}): HomeLibraryVideo {
  return {
    contentTypeSlug: 'movie',
    createdAt: new Date('2026-03-11'),
    description: 'A stored clip.',
    duration: 180,
    genreSlugs: ['action'],
    id: 'video-1',
    isPrivate: true,
    permissions: { canDelete: true, canEdit: true, canManageVisibility: true },
    tags: ['neo'],
    title: 'Catalog Fixture',
    thumbnailUrl: '/thumb.jpg',
    videoUrl: '/videos/video-1/manifest.mpd',
    ...overrides,
  };
}

function renderDetails(video = createVideo()) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <VideoDetailsView
          contentTypes={[{ active: true, label: 'Movie', slug: 'movie', sortOrder: 1 }]}
          genres={[{ active: true, label: 'Action', slug: 'action', sortOrder: 1 }]}
          redirectTo="/"
          video={video}
        />
      ),
    },
  ]);
  render(<RouterProvider router={router} />);
}

describe('Page-owned video detail content', () => {
  beforeEach(() => {
    viewer.user = { id: 'owner-1', username: 'owner' };
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());
  test('renders actual media metadata without duplicating the parent page chrome or save actions', () => {
    renderDetails();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    const summary = screen.getByRole('complementary', { name: 'Video summary' });
    expect(within(summary).getByRole('heading', { name: 'Catalog Fixture' })).toBeInTheDocument();
    expect(within(summary).getByText('Movie')).toBeInTheDocument();
    expect(within(summary).getByText('Action')).toBeInTheDocument();
    expect(within(summary).getByText('neo')).toBeInTheDocument();
  });
  test('anonymous public viewers do not receive owner controls or playlist mutation affordances', () => {
    viewer.user = undefined;
    renderDetails(
      createVideo({
        isPrivate: false,
        permissions: { canEdit: false, canDelete: false, canManageVisibility: false },
      }),
    );
    expect(screen.getByText('A stored clip.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete video' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to playlist' })).not.toBeInTheDocument();
  });
  test('adds the current video through the same owned-playlist chooser used by library cards', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          playlists: [
            {
              id: 'collection',
              name: 'My collection',
              ownerId: 'owner-1',
              type: 'user_created',
              isPublic: false,
              createdAt: new Date(),
              updatedAt: new Date(),
              videoIds: [],
            },
          ],
          totalCount: 1,
          hasMore: false,
        }),
      )
      .mockResolvedValueOnce(Response.json({ success: true }));
    renderDetails();
    await user.click(screen.getByRole('button', { name: 'Add to playlist' }));
    await user.click(await screen.findByRole('button', { name: /My collection/ }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add to playlist' })).not.toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/playlists/collection/items',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ videoId: 'video-1' }) }),
    );
  });
});
