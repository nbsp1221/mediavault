import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { HomePage } from '../../../app/pages/home/ui/HomePage';

const { deleteVideoMock, updateVideoMock } = vi.hoisted(() => ({
  deleteVideoMock: vi.fn(),
  updateVideoMock: vi.fn(),
}));

vi.mock('~/features/video-management/api/video-actions', () => ({
  libraryVideoActions: {
    changeVisibility: vi.fn(),
    deleteVideo: deleteVideoMock,
    updateVideo: updateVideoMock,
  },
}));

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => ({
    id: 'user-1',
    username: 'owner',
  }),
}));

function createVideo(overrides: Partial<HomeLibraryVideo> = {}): HomeLibraryVideo {
  return {
    createdAt: new Date('2026-03-11T00:00:00.000Z'),
    duration: 180,
    id: 'video-1',
    isPrivate: false,
    permissions: {
      canDelete: true,
      canEdit: true,
      canManageVisibility: true,
    },
    tags: ['Action'],
    thumbnailUrl: '/thumb.jpg',
    title: 'Catalog Fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    ...overrides,
  };
}

function renderHomePage(videoOverrides: Partial<HomeLibraryVideo> = {}) {
  render(
    <MemoryRouter>
      <HomePage
        initialFilters={{
          includeTags: [],
          query: '',
        }}
        videos={[createVideo(videoOverrides)]}
      />
    </MemoryRouter>,
  );
}

async function openDeleteDialogFromActionsMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Open actions menu for / }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
}

describe('HomePage', () => {
  test('filters by search text and tag toggles, keeps semantically equal filter sync stable, and resyncs when incoming videos change', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryRouter>
        <HomePage
          initialFilters={{
            includeTags: ['Action'],
            query: 'Action',
          }}
          videos={[
            createVideo(),
            createVideo({
              id: 'video-2',
              tags: ['Drama'],
              title: 'Second Fixture',
            }),
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Catalog Fixture')).toBeInTheDocument();
    expect(screen.queryByText('Second Fixture')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove required action tag' }));
    await user.clear(screen.getByLabelText('Search library (desktop)'));
    await user.type(screen.getByLabelText('Search library (desktop)'), 'Second');
    expect(screen.getByText('Second Fixture')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <HomePage
          initialFilters={{
            includeTags: ['Action'],
            query: 'Action',
          }}
          videos={[
            createVideo(),
            createVideo({
              id: 'video-2',
              tags: ['Drama'],
              title: 'Second Fixture',
            }),
            createVideo({
              id: 'video-3',
              tags: ['Drama'],
              title: 'Third Fixture',
            }),
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Search library (desktop)')).toHaveValue('Second');
    expect(screen.getByText('Second Fixture')).toBeInTheDocument();
    expect(screen.queryByText('Third Fixture')).not.toBeInTheDocument();

    await user.click(screen.getByText('#Drama'));
    expect(screen.getByText('Active filters:')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <HomePage
          initialFilters={{
            includeTags: ['drama'],
            query: 'second',
          }}
          videos={[
            createVideo(),
            createVideo({
              id: 'video-2',
              tags: ['Drama'],
              title: 'Second Fixture',
            }),
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Search library (desktop)')).toHaveValue('Second');

    rerender(
      <MemoryRouter>
        <HomePage
          initialFilters={{
            includeTags: [],
            query: '',
          }}
          videos={[
            createVideo({
              id: 'video-3',
              title: 'Third Fixture',
            }),
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Third Fixture')).toBeInTheDocument();
    expect(screen.queryByText('Catalog Fixture')).not.toBeInTheDocument();
  });

  test('treats tag toggles as case-insensitive when removing an active bootstrap tag', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <HomePage
          initialFilters={{
            includeTags: ['drama'],
            query: '',
          }}
          videos={[
            createVideo({
              id: 'video-2',
              tags: ['Drama'],
              title: 'Second Fixture',
            }),
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Remove required drama tag' })).toBeInTheDocument();
    await user.click(screen.getByText('#Drama'));
    expect(screen.queryByText('Active filters:')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove required Drama tag' }),
    ).not.toBeInTheDocument();
  });

  test('opens the edit page from the card action menu while preserving return context', async () => {
    const user = userEvent.setup();
    renderHomePage({
      description: 'Original description',
    });

    await user.click(screen.getByRole('button', { name: /^Open actions menu for / }));

    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/videos/video-1/edit?redirectTo=%2F',
    );
    expect(screen.queryByRole('menuitem', { name: 'Quick view' })).not.toBeInTheDocument();
  });

  test('surfaces delete failures without removing the card', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteVideoMock.mockReset();
    updateVideoMock.mockReset();
    deleteVideoMock.mockRejectedValueOnce(new Error('delete failed'));

    try {
      renderHomePage({
        description: 'Canonical description',
        tags: ['Action', 'Neo'],
        title: 'Canonical Fixture',
      });

      await openDeleteDialogFromActionsMenu(user);
      const failedDeleteDialog = screen.getByRole('alertdialog', { name: 'Delete video?' });
      await user.click(within(failedDeleteDialog).getByRole('button', { name: 'Delete video' }));
      expect(within(failedDeleteDialog).getByRole('alert')).toHaveTextContent('delete failed');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('heading', { name: 'Canonical Fixture' })).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  test('adds a library card video through the shared playlist chooser', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          playlists: [
            {
              id: 'collection',
              name: 'My collection',
              ownerId: 'user-1',
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
    try {
      renderHomePage();
      await user.click(screen.getByRole('button', { name: /^Open actions menu for / }));
      await user.click(screen.getByRole('menuitem', { name: 'Add to playlist' }));
      await user.click(await screen.findByRole('button', { name: /My collection/ }));
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/playlists/collection/items',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ videoId: 'video-1' }) }),
      );
      expect(screen.getByRole('heading', { name: 'Catalog Fixture' })).toBeInTheDocument();
    } finally {
      fetchMock.mockRestore();
    }
  });

  test('removes the card after a successful delete', async () => {
    const user = userEvent.setup();
    deleteVideoMock.mockReset();
    updateVideoMock.mockReset();
    deleteVideoMock.mockResolvedValueOnce(undefined);

    renderHomePage({
      description: 'Canonical description',
      tags: ['Action', 'Neo'],
      title: 'Canonical Fixture',
    });

    await openDeleteDialogFromActionsMenu(user);
    const successfulDeleteDialog = screen.getByRole('alertdialog', { name: 'Delete video?' });
    await user.click(within(successfulDeleteDialog).getByRole('button', { name: 'Delete video' }));

    expect(screen.queryByRole('heading', { name: 'Canonical Fixture' })).not.toBeInTheDocument();
  });
});
