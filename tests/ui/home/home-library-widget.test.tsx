import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';

import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { HomeLibraryWidget } from '../../../app/widgets/home-library/ui/HomeLibraryWidget';

const deleteVideoMock = vi.fn();
const updateVideoMock = vi.fn();

vi.mock('~/features/home-library-video-actions/model/useHomeLibraryVideoActions', () => ({
  useHomeLibraryVideoActions: () => ({
    deleteVideo: deleteVideoMock,
    updateVideo: updateVideoMock,
  }),
}));

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => ({
    email: 'owner@example.com',
    id: 'user-1',
    role: 'admin',
  }),
}));

function createVideo(overrides: Partial<HomeLibraryVideo> = {}): HomeLibraryVideo {
  return {
    createdAt: new Date('2026-03-11T00:00:00.000Z'),
    duration: 180,
    id: 'video-1',
    tags: ['Action'],
    thumbnailUrl: '/thumb.jpg',
    title: 'Catalog Fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    ...overrides,
  };
}

function renderHomeLibraryWidget(videoOverrides: Partial<HomeLibraryVideo> = {}) {
  render(
    <MemoryRouter>
      <HomeLibraryWidget
        initialFilters={{
          includeTags: [],
          query: '',
        }}
        videos={[
          createVideo(videoOverrides),
        ]}
      />
    </MemoryRouter>,
  );
}

async function openQuickView(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open actions menu' }));
  await user.click(screen.getByRole('menuitem', { name: 'Quick view' }));
}

describe('HomeLibraryWidget', () => {
  test('filters by search text and tag toggles, keeps semantically equal filter sync stable, and resyncs when incoming videos change', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryRouter>
        <HomeLibraryWidget
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

    expect(screen.getByText('Total 2 videos • Showing 1')).toBeInTheDocument();
    expect(screen.getByText('Catalog Fixture')).toBeInTheDocument();
    expect(screen.queryByText('Second Fixture')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove required action tag' }));
    await user.clear(screen.getByLabelText('Search library (desktop)'));
    await user.type(screen.getByLabelText('Search library (desktop)'), 'Second');
    expect(screen.getByText('Second Fixture')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <HomeLibraryWidget
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
        <HomeLibraryWidget
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
        <HomeLibraryWidget
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
        <HomeLibraryWidget
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
    expect(screen.queryByRole('button', { name: 'Remove required Drama tag' })).not.toBeInTheDocument();
  });

  test('opens the quick view from the action menu', async () => {
    const user = userEvent.setup();
    renderHomeLibraryWidget({
      description: 'Original description',
    });

    await openQuickView(user);

    expect(screen.getByRole('heading', { name: 'Catalog Fixture' })).toBeInTheDocument();
  });

  test('surfaces update failures and preserves draft state before a successful save', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteVideoMock.mockReset();
    updateVideoMock.mockReset();
    updateVideoMock
      .mockRejectedValueOnce(new Error('update failed'))
      .mockResolvedValueOnce({
        createdAt: new Date('2026-03-11T00:00:00.000Z'),
        description: 'Canonical description',
        duration: 180,
        id: 'video-1',
        tags: ['Action', 'Neo'],
        thumbnailUrl: '/thumb.jpg',
        title: 'Canonical Fixture',
        videoUrl: '/videos/video-1/manifest.mpd',
      });

    try {
      renderHomeLibraryWidget({
        description: 'Original description',
      });

      await openQuickView(user);
      expect(screen.getByRole('heading', { name: 'Catalog Fixture' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Edit Info' }));
      await user.clear(screen.getByLabelText('Title'));
      await user.type(screen.getByLabelText('Title'), 'Updated Fixture');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(updateVideoMock).toHaveBeenCalledOnce();
      expect(screen.getByRole('alert')).toHaveTextContent('update failed');
      expect(screen.getByLabelText('Title')).toHaveValue('Updated Fixture');

      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByRole('heading', { name: 'Canonical Fixture' })).toBeInTheDocument();
      expect(screen.getByText('Canonical description')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
    finally {
      consoleError.mockRestore();
    }
  });

  test('surfaces delete failures and removes the quick view after a successful delete', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteVideoMock.mockReset();
    updateVideoMock.mockReset();
    deleteVideoMock
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockResolvedValueOnce(undefined);

    try {
      renderHomeLibraryWidget({
        description: 'Canonical description',
        tags: ['Action', 'Neo'],
        title: 'Canonical Fixture',
      });

      await openQuickView(user);
      expect(screen.getByRole('heading', { name: 'Canonical Fixture' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Delete' }));
      const failedDeleteDialog = screen.getByRole('dialog', { name: 'Delete Video' });
      await user.click(within(failedDeleteDialog).getByRole('button', { name: 'Delete' }));
      expect(within(failedDeleteDialog).getByRole('alert')).toHaveTextContent('delete failed');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('heading', { name: 'Canonical Fixture' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Delete' }));
      const successfulDeleteDialog = screen.getByRole('dialog', { name: 'Delete Video' });
      await user.click(within(successfulDeleteDialog).getByRole('button', { name: 'Delete' }));

      expect(screen.queryByRole('heading', { name: 'Canonical Fixture' })).not.toBeInTheDocument();
    }
    finally {
      consoleError.mockRestore();
    }
  });
});
