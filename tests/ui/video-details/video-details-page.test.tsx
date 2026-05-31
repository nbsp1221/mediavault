import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { VideoDetailsPage } from '../../../app/pages/video-details/ui/VideoDetailsPage';

const mocks = vi.hoisted(() => ({
  changeLibraryVideoVisibility: vi.fn(),
  deleteLibraryVideo: vi.fn(),
  toastSuccess: vi.fn(),
  updateLibraryVideoMetadata: vi.fn(),
}));

vi.mock('~/features/home-library-video-actions/model/useHomeLibraryVideoActions', () => ({
  changeLibraryVideoVisibility: mocks.changeLibraryVideoVisibility,
  deleteLibraryVideo: mocks.deleteLibraryVideo,
  updateLibraryVideoMetadata: mocks.updateLibraryVideoMetadata,
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
  },
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
    mocks.toastSuccess.mockReset();
    mocks.updateLibraryVideoMetadata.mockReset();
  });

  test('renders media context, metadata form, visibility section, and danger zone as separate areas', () => {
    renderDetailsPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Video details' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to library' })).toHaveAttribute('href', '/?q=Action&tag=Neo');
    expect(screen.getByRole('link', { name: 'Watch video' })).toHaveAttribute('href', '/player/video-1');
    expect(screen.getByLabelText('Title')).toHaveValue('Catalog Fixture');
    expect(screen.getByLabelText('Description (optional)')).toHaveValue('A stored vault clip.');
    expect(screen.getByText('Visibility: Private')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make Public' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Danger zone' })).toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
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
    expect(screen.getByRole('dialog', { name: 'Make video public?' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Make Public' }).at(-1)!);

    expect(mocks.changeLibraryVideoVisibility).toHaveBeenCalledWith(expect.objectContaining({ id: 'video-1' }), 'public');
    expect(await screen.findByRole('status')).toHaveTextContent('Visibility updated to Public.');
    expect(screen.getByText('Visibility: Public')).toBeInTheDocument();
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
    expect(screen.getByText('Visibility: Public')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Make Private' }));
    expect(screen.queryByRole('dialog', { name: 'Make video public?' })).not.toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Visibility updated to Private.');
    expect(screen.getByText('Visibility: Private')).toBeInTheDocument();
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
    const deleteDialog = screen.getByRole('dialog', { name: 'Delete video?' });
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
    const deleteDialog = screen.getByRole('dialog', { name: 'Delete video?' });
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
    const deleteDialog = screen.getByRole('dialog', { name: 'Delete video?' });
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
    await user.click(screen.getByRole('link', { name: 'Back to library' }));

    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/videos/video-1/edit');
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Draft Fixture');

    await user.click(screen.getByRole('link', { name: 'Back to library' }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'), { timeout: 5_000 });
    expect(router.state.location.search).toBe('?q=Action&tag=Neo');
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
    await user.click(screen.getByRole('link', { name: 'Back to library' }));

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
