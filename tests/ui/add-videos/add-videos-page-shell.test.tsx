import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AddVideosPage } from '../../../app/pages/add-videos/ui/AddVideosPage';

const addVideosViewMock = vi.hoisted(() => ({
  canAddToLibrary: false,
  handleAddToLibrary: vi.fn(),
  handleChooseFiles: vi.fn(),
  handleClearSession: vi.fn(),
  handleContentTypeChange: vi.fn(),
  handleDescriptionChange: vi.fn(),
  handleGenreSlugsChange: vi.fn(),
  handleRemoveSession: vi.fn(),
  handleRetryUpload: vi.fn(),
  handleTagsChange: vi.fn(),
  handleTitleChange: vi.fn(),
  pageError: null as string | null,
  session: null as null | {
    error: string | null;
    file: File;
    filename: string;
    metadata: {
      description: string;
      genreSlugs: string[];
      tags: string[];
      title: string;
    };
    mimeType: string;
    progressPercent: number;
    size: number;
    stagingId: string | null;
    status: 'submitted' | 'uploaded';
    successMessage: string | null;
  },
}));

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => ({
    id: 'owner-1',
    username: 'owner',
  }),
}));

vi.mock('~/pages/add-videos/model/useAddVideosView', () => ({
  useAddVideosView: () => addVideosViewMock,
}));

vi.mock('~/pages/add-videos/model/useIngestJobs', () => ({
  useIngestJobs: () => ({
    acceptJob: vi.fn(),
    actionError: null,
    control: vi.fn(),
    isLoading: false,
    jobs: [],
    pendingIds: [],
    refresh: vi.fn(),
    statusError: null,
  }),
}));

function renderPage() {
  const router = createMemoryRouter(
    [{ path: '*', element: <AddVideosPage contentTypes={[]} genres={[]} /> }],
    { initialEntries: ['/add-videos'] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}

function setStagedSession(status: 'submitted' | 'uploaded' = 'uploaded') {
  addVideosViewMock.session = {
    error: null,
    file: new File(['video'], 'fixture.mp4'),
    filename: 'fixture.mp4',
    metadata: { description: '', genreSlugs: [], tags: [], title: 'Fixture' },
    mimeType: 'video/mp4',
    progressPercent: 100,
    size: 1_024,
    stagingId: 'stage',
    status,
    successMessage: null,
  };
}

describe('AddVideosPage shell contract', () => {
  beforeEach(() => {
    addVideosViewMock.canAddToLibrary = false;
    addVideosViewMock.pageError = null;
    addVideosViewMock.session = null;
    addVideosViewMock.handleAddToLibrary.mockReset();
    addVideosViewMock.handleRemoveSession.mockReset();
  });

  test('renders upload workflow inside the product shell without library search or duplicate upload action', () => {
    renderPage();

    expect(
      within(screen.getByRole('banner')).getByRole('heading', { level: 1, name: 'Upload a video' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1, name: 'Upload a video' })).toHaveLength(1);
    expect(screen.getByText('Choose one video to upload')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload' })).toHaveAttribute('href', '/add-videos');
    expect(screen.getByRole('link', { name: 'Upload' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to Library' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Upload Videos/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Account menu')).toBeInTheDocument();
  });

  test('wires page-level add and remove callbacks into the upload view', async () => {
    const user = userEvent.setup();
    addVideosViewMock.canAddToLibrary = true;
    addVideosViewMock.session = {
      error: null,
      file: new File(['video'], 'fixture.mp4', { type: 'video/mp4' }),
      filename: 'fixture.mp4',
      metadata: {
        description: '',
        genreSlugs: [],
        tags: [],
        title: 'Fixture',
      },
      mimeType: 'video/mp4',
      progressPercent: 100,
      size: 1024,
      stagingId: 'staging-1',
      status: 'uploaded',
      successMessage: null,
    };

    renderPage();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Add to Library' }));

    expect(addVideosViewMock.handleRemoveSession).toHaveBeenCalledOnce();
    expect(addVideosViewMock.handleAddToLibrary).toHaveBeenCalledOnce();
  });

  test('warns before unsubmitted navigation, Stay retains draft and Leave explicitly discards local work', async () => {
    const user = userEvent.setup();
    setStagedSession();
    const { router } = renderPage();
    await user.click(screen.getByRole('link', { name: 'Videos' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/add-videos');
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe('/add-videos');
    await user.click(screen.getByRole('link', { name: 'Videos' }));
    await user.click(screen.getByRole('button', { name: 'Leave upload' }));
    expect(router.state.location.pathname).toBe('/');
    expect(addVideosViewMock.handleClearSession).toHaveBeenCalled();
  });

  test('accepted processing does not block navigation or claim the file transfer is resumable', async () => {
    const user = userEvent.setup();
    setStagedSession('submitted');
    const { router } = renderPage();
    await user.click(screen.getByRole('link', { name: 'Videos' }));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
