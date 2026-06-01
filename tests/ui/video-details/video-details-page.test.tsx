import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { VideoDetailsPage } from '../../../app/pages/video-details/ui/VideoDetailsPage';

const mocks = vi.hoisted(() => ({
  changeLibraryVideoVisibility: vi.fn(),
  deleteLibraryVideo: vi.fn(),
  toast: vi.fn(),
  toastSuccess: vi.fn(),
  updateLibraryVideoMetadata: vi.fn(),
}));

vi.mock('~/features/home-library-video-actions/model/useHomeLibraryVideoActions', () => ({
  changeLibraryVideoVisibility: mocks.changeLibraryVideoVisibility,
  deleteLibraryVideo: mocks.deleteLibraryVideo,
  updateLibraryVideoMetadata: mocks.updateLibraryVideoMetadata,
}));

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => ({
    id: 'owner-1',
    role: 'admin',
    username: 'owner',
  }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(mocks.toast, {
    success: mocks.toastSuccess,
  }),
}));

function createVideo(overrides: Partial<HomeLibraryVideo> = {}): HomeLibraryVideo {
  return {
    contentTypeSlug: 'movie',
    createdAt: new Date('2026-03-11T00:00:00.000Z'),
    description: 'A stored vault clip.',
    duration: 180,
    genreSlugs: ['action'],
    id: 'video-1',
    isPrivate: true,
    permissions: {
      canDelete: true,
      canEdit: true,
      canManageVisibility: true,
    },
    tags: ['Action', 'Neo'],
    thumbnailUrl: '/thumb.jpg',
    title: 'Catalog Fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    ...overrides,
  };
}

function renderDetailsPage(video = createVideo()) {
  const router = createMemoryRouter([
    {
      path: '/videos/:videoId/edit',
      element: (
        <VideoDetailsPage
          contentTypes={[{ active: true, label: 'Movie', slug: 'movie', sortOrder: 10 }]}
          genres={[{ active: true, label: 'Action', slug: 'action', sortOrder: 10 }]}
          redirectTo="/?q=Action&tag=Neo"
          video={video}
        />
      ),
    },
    {
      path: '/',
      element: <div>Library route</div>,
    },
    {
      path: '/playlists',
      element: <div>Playlists route</div>,
    },
    {
      path: '/add-videos',
      element: <div>Upload route</div>,
    },
    {
      path: '/api/auth/logout',
      element: <div>Logout route</div>,
    },
    {
      path: '/player/:videoId',
      element: <div>Player route</div>,
    },
  ], {
    initialEntries: ['/videos/video-1/edit'],
  });

  render(<RouterProvider router={router} />);

  return router;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

describe('VideoDetailsPage', () => {
  beforeEach(() => {
    mocks.changeLibraryVideoVisibility.mockReset();
    mocks.deleteLibraryVideo.mockReset();
    mocks.toast.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.updateLibraryVideoMetadata.mockReset();
  });

  test('renders media context, metadata form, visibility section, and danger zone as separate areas', () => {
    renderDetailsPage();

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(within(screen.getByRole('banner')).getByRole('heading', { level: 1, name: 'Video details' })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Back to library' })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1, name: 'Video details' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Watch video' })).toHaveAttribute('href', '/player/video-1');

    const basicInformation = screen.getByRole('region', { name: 'Basic information' });
    const classification = screen.getByRole('region', { name: 'Classification' });
    const visibility = screen.getByRole('region', { name: 'Visibility' });
    const dangerZone = screen.getByRole('region', { name: 'Danger zone' });
    expect(basicInformation.compareDocumentPosition(classification) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(classification.compareDocumentPosition(visibility) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(visibility.compareDocumentPosition(dangerZone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(basicInformation).getByLabelText('Title')).toHaveValue('Catalog Fixture');
    expect(within(basicInformation).getByLabelText('Description (optional)')).toHaveValue('A stored vault clip.');
    expect(within(basicInformation).getByLabelText('Tags')).toBeInTheDocument();
    expect(within(classification).getByLabelText('Content type')).toBeInTheDocument();
    expect(within(classification).getByLabelText('Genre')).toBeInTheDocument();
    expect(within(visibility).getByText('Current visibility: Private')).toBeInTheDocument();
    expect(screen.getAllByText('Private').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'Make Public' })).toBeInTheDocument();
    expect(dangerZone).toBeInTheDocument();
  });

  test('renders public and read-only video details without owner-only controls', () => {
    renderDetailsPage(createVideo({
      isPrivate: false,
      permissions: {
        canDelete: false,
        canEdit: false,
        canManageVisibility: false,
      },
      thumbnailUrl: undefined,
    }));

    expect(screen.queryByText('Private')).not.toBeInTheDocument();
    expect(screen.getAllByText('Public').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('No thumbnail')).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make Private' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Danger zone' })).not.toBeInTheDocument();
  });

  test('saves metadata explicitly, keeps visibility out of the payload, and shows success feedback', async () => {
    const user = userEvent.setup();
    mocks.updateLibraryVideoMetadata.mockResolvedValue(createVideo({
      title: 'Updated Fixture',
    }));
    renderDetailsPage();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Updated Fixture');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(mocks.updateLibraryVideoMetadata).toHaveBeenCalledWith(expect.objectContaining({ id: 'video-1' }), expect.objectContaining({
      description: 'A stored vault clip.',
      title: 'Updated Fixture',
    }));
    expect(mocks.updateLibraryVideoMetadata.mock.calls[0][1]).not.toHaveProperty('visibility');
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Video details saved.'));
    expect(screen.getByLabelText('Title')).toHaveValue('Updated Fixture');
  });

  test('submits the same metadata form from the compact mobile save action', async () => {
    const user = userEvent.setup();
    mocks.updateLibraryVideoMetadata.mockResolvedValue(createVideo({
      title: 'Mobile Fixture',
    }));
    renderDetailsPage();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Mobile Fixture');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mocks.updateLibraryVideoMetadata).toHaveBeenCalledWith(expect.objectContaining({ id: 'video-1' }), expect.objectContaining({
      description: 'A stored vault clip.',
      title: 'Mobile Fixture',
    }));
    expect(mocks.updateLibraryVideoMetadata.mock.calls[0][1]).not.toHaveProperty('visibility');
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Video details saved.'));
  });

  test('keeps save failures inline and preserves the edited draft', async () => {
    const user = userEvent.setup();
    mocks.updateLibraryVideoMetadata.mockRejectedValue(new Error('update failed'));
    renderDetailsPage();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Draft Fixture');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('update failed');
    expect(screen.getByLabelText('Title')).toHaveValue('Draft Fixture');
  });

  test('validates metadata edge cases before submitting', async () => {
    const user = userEvent.setup();
    renderDetailsPage();

    await user.clear(screen.getByLabelText('Title'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(mocks.updateLibraryVideoMetadata).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'A'.repeat(201) },
    });
    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: 'D'.repeat(1001) },
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Title must be within 200 characters')).toBeInTheDocument();
    expect(screen.getByText('Description must be within 1000 characters')).toBeInTheDocument();
    expect(mocks.updateLibraryVideoMetadata).not.toHaveBeenCalled();
  });

  test('normalizes duplicate, empty, and whitespace-heavy metadata tags before saving', async () => {
    const user = userEvent.setup();
    mocks.updateLibraryVideoMetadata.mockResolvedValue(createVideo({
      tags: ['action', 'neo', 'new_tag'],
    }));
    renderDetailsPage();

    fireEvent.change(screen.getByLabelText('Tags'), {
      target: { value: ' Action, neo, New Tag, , action ' },
    });
    fireEvent.blur(screen.getByLabelText('Tags'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(mocks.updateLibraryVideoMetadata).toHaveBeenCalledWith(expect.objectContaining({ id: 'video-1' }), expect.objectContaining({
      tags: ['action', 'neo', 'new_tag'],
    }));
  });

  test('disables metadata actions while save is pending and re-enables them after save finishes', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<HomeLibraryVideo>();
    mocks.updateLibraryVideoMetadata.mockReturnValue(deferred.promise);
    renderDetailsPage();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Pending Fixture');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getAllByRole('button', { name: 'Saving...' }).every(button => button.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    deferred.resolve(createVideo({ title: 'Pending Fixture' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled());
  });

  test('confirms private to public visibility separately from metadata save', async () => {
    const user = userEvent.setup();
    mocks.changeLibraryVideoVisibility.mockResolvedValue(createVideo({
      isPrivate: false,
    }));
    renderDetailsPage();

    await user.click(screen.getByRole('button', { name: 'Make Public' }));
    expect(screen.getByRole('alertdialog', { name: 'Make video public?' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Make Public' }).at(-1)!);

    expect(mocks.changeLibraryVideoVisibility).toHaveBeenCalledWith(expect.objectContaining({ id: 'video-1' }), 'public');
    expect(await screen.findByRole('status')).toHaveTextContent('Visibility updated to Public.');
    expect(screen.getByText('Current visibility: Public')).toBeInTheDocument();
  });

  test('preserves unsaved metadata drafts when visibility changes', async () => {
    const user = userEvent.setup();
    mocks.changeLibraryVideoVisibility.mockResolvedValue(createVideo({
      isPrivate: false,
    }));
    renderDetailsPage();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Unsaved draft title');
    await user.click(screen.getByRole('button', { name: 'Make Public' }));
    await user.click(screen.getAllByRole('button', { name: 'Make Public' }).at(-1)!);

    expect(await screen.findByRole('status')).toHaveTextContent('Visibility updated to Public.');
    expect(screen.getByLabelText('Title')).toHaveValue('Unsaved draft title');

    await user.click(screen.getByRole('link', { name: 'Playlists' }));
    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
  });

  test('makes public videos private without confirmation and keeps failed visibility changes section-local', async () => {
    const user = userEvent.setup();
    mocks.changeLibraryVideoVisibility
      .mockRejectedValueOnce(new Error('visibility failed'))
      .mockResolvedValueOnce(createVideo({
        isPrivate: true,
      }));
    renderDetailsPage(createVideo({
      isPrivate: false,
    }));

    await user.click(screen.getByRole('button', { name: 'Make Private' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Visibility could not be updated. Try again.');
    expect(screen.getByText('Current visibility: Public')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Make Private' }));
    expect(screen.queryByRole('alertdialog', { name: 'Make video public?' })).not.toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Visibility updated to Private.');
    expect(screen.getByText('Current visibility: Private')).toBeInTheDocument();
  });

  test('disables visibility actions while a change is pending', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<HomeLibraryVideo>();
    mocks.changeLibraryVideoVisibility.mockReturnValue(deferred.promise);
    renderDetailsPage(createVideo({
      isPrivate: false,
    }));

    await user.click(screen.getByRole('button', { name: 'Make Private' }));

    expect(screen.getByRole('button', { name: 'Updating...' })).toBeDisabled();
    deferred.resolve(createVideo({
      isPrivate: true,
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Visibility updated to Private.');
  });

  test('uses the shared destructive confirmation and returns to the library after details delete', async () => {
    const user = userEvent.setup();
    const router = renderDetailsPage();
    mocks.deleteLibraryVideo.mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const deleteDialog = screen.getByRole('alertdialog', { name: 'Delete video?' });
    expect(deleteDialog).toHaveTextContent('Catalog Fixture');
    expect(deleteDialog).toHaveTextContent('This action cannot be undone.');
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete video' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'), { timeout: 5_000 });
    expect(router.state.location.search).toBe('?q=Action&tag=Neo');
  });

  test('prevents duplicate delete confirmation while delete is pending', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<void>();
    mocks.deleteLibraryVideo.mockReturnValue(deferred.promise);
    renderDetailsPage();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const deleteDialog = screen.getByRole('alertdialog', { name: 'Delete video?' });
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete video' }));

    expect(within(deleteDialog).getByRole('button', { name: 'Deleting...' })).toBeDisabled();
    expect(within(deleteDialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.click(within(deleteDialog).getByRole('button', { name: 'Deleting...' }));
    expect(mocks.deleteLibraryVideo).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
  });

  test('keeps the delete dialog open with an inline error when details delete fails', async () => {
    const user = userEvent.setup();
    mocks.deleteLibraryVideo.mockRejectedValue(new Error('delete failed'));
    renderDetailsPage();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const deleteDialog = screen.getByRole('alertdialog', { name: 'Delete video?' });
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete video' }));

    expect(await within(deleteDialog).findByRole('alert')).toHaveTextContent('delete failed');
    expect(deleteDialog).toHaveTextContent('Catalog Fixture');
    expect(within(deleteDialog).getByRole('button', { name: 'Delete video' })).toBeEnabled();
  });

  test('guards unsaved metadata changes before internal navigation', async () => {
    const user = userEvent.setup();
    const router = renderDetailsPage();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Draft Fixture');
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Back to library' }));

    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/videos/video-1/edit');
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Draft Fixture');

    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Back to library' }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'), { timeout: 5_000 });
    expect(router.state.location.search).toBe('?q=Action&tag=Neo');
  });

  test('guards unsaved metadata changes before product navigation links', async () => {
    const user = userEvent.setup();
    const router = renderDetailsPage();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Shell Navigation Draft');
    await user.click(
      within(screen.getByRole('navigation', { name: 'Product navigation' })).getByRole('link', { name: 'Playlists' }),
    );

    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/videos/video-1/edit');
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/playlists'), { timeout: 5_000 });
  });

  test('guards unsaved metadata changes before brand navigation links', async () => {
    const user = userEvent.setup();
    const router = renderDetailsPage();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Brand Navigation Draft');
    await user.click(screen.getByRole('link', { name: 'Mediavault home' }));

    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/videos/video-1/edit');
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'), { timeout: 5_000 });
  });

  test('does not guard unsaved metadata changes for coming-soon product actions', async () => {
    const user = userEvent.setup();
    const router = renderDetailsPage();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Soon Action Draft');
    await user.click(screen.getByRole('button', { name: 'Favorites, Soon' }));

    expect(mocks.toast).toHaveBeenCalledWith('Favorites is coming soon.', { id: 'product-nav-favorites' });
    expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/videos/video-1/edit');
  });

  test('guards unsaved metadata changes before account logout navigation', async () => {
    const user = userEvent.setup();
    const router = renderDetailsPage();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Logout Draft');
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Logout' }));

    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/videos/video-1/edit');
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/api/auth/logout'), { timeout: 5_000 });
  });

  test('guards unsaved metadata changes before watch navigation and browser unload', async () => {
    const user = userEvent.setup();
    const router = renderDetailsPage();
    const beforeUnloadEvent = new Event('beforeunload', {
      cancelable: true,
    });

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Watch Draft');

    window.dispatchEvent(beforeUnloadEvent);
    expect(beforeUnloadEvent.defaultPrevented).toBe(true);

    await user.click(screen.getByRole('link', { name: 'Watch video' }));
    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/videos/video-1/edit');

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/player/video-1'), { timeout: 5_000 });
  });

  test('allows navigation without an unsaved prompt after successful save', async () => {
    const user = userEvent.setup();
    const router = renderDetailsPage();
    mocks.updateLibraryVideoMetadata.mockResolvedValue(createVideo({
      title: 'Saved Fixture',
    }));

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Saved Fixture');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Video details saved.'));
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Back to library' }));

    expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).not.toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'), { timeout: 5_000 });
  });

  test('guards unsaved metadata changes before cancel navigation', async () => {
    const user = userEvent.setup();
    const router = renderDetailsPage();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Cancel Draft');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/videos/video-1/edit');
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'), { timeout: 5_000 });
    expect(router.state.location.search).toBe('?q=Action&tag=Neo');
  });
});
