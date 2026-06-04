import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeAll, describe, expect, test } from 'vitest';
import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { VideoDetailsView } from '../../../app/widgets/video-details/ui/VideoDetailsView';

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
    tags: ['neo'],
    title: 'Catalog Fixture',
    thumbnailUrl: '/thumb.jpg',
    videoUrl: '/videos/video-1/manifest.mpd',
    ...overrides,
  };
}

function renderDetailsView(
  video = createVideo(),
  options: {
    readonly showPageHeader?: boolean;
  } = {},
) {
  const router = createMemoryRouter([
    {
      path: '/videos/:videoId/edit',
      element: (
        <VideoDetailsView
          contentTypes={[
            { active: true, label: 'Episode', slug: 'episode', sortOrder: 10 },
            { active: true, label: 'Movie', slug: 'movie', sortOrder: 20 },
          ]}
          genres={[
            { active: true, label: 'Drama', slug: 'drama', sortOrder: 10 },
            { active: true, label: 'Action', slug: 'action', sortOrder: 20 },
          ]}
          redirectTo="/?tag=neo"
          showPageHeader={options.showPageHeader}
          video={video}
        />
      ),
    },
    {
      path: '/',
      element: <div>Library route</div>,
    },
  ], {
    initialEntries: ['/videos/video-1/edit'],
  });

  render(<RouterProvider router={router} />);

  return router;
}

describe('VideoDetailsView', () => {
  beforeAll(() => {
    class TestResizeObserver {
      disconnect() {
        return undefined;
      }

      observe() {
        return undefined;
      }

      unobserve() {
        return undefined;
      }
    }

    globalThis.ResizeObserver = TestResizeObserver;
    window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
      return undefined;
    };
  });

  test('renders the standalone header and owner summary with matched taxonomy labels', () => {
    renderDetailsView();

    expect(screen.getByRole('heading', { level: 1, name: 'Video details' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to library' })).toHaveAttribute('href', '/?tag=neo');

    const summary = screen.getByRole('complementary', { name: 'Video summary' });
    expect(within(summary).getByRole('heading', { level: 2, name: 'Catalog Fixture' })).toBeInTheDocument();
    expect(within(summary).getByText('Movie')).toBeInTheDocument();
    expect(within(summary).getByText('Action')).toBeInTheDocument();
    expect(within(summary).getByText('neo')).toBeInTheDocument();
    expect(within(summary).queryByText('Episode')).not.toBeInTheDocument();
    expect(within(summary).queryByText('Drama')).not.toBeInTheDocument();
  });

  test('omits standalone header chrome when embedded by the product shell', () => {
    renderDetailsView(createVideo(), { showPageHeader: false });

    expect(screen.queryByRole('heading', { level: 1, name: 'Video details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to library' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Video summary' })).toBeInTheDocument();
  });

  test('allows clean standalone navigation without an unsaved-changes prompt', async () => {
    const user = userEvent.setup();
    const router = renderDetailsView();

    await user.click(screen.getByRole('link', { name: 'Back to library' }));

    expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).not.toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('?tag=neo');
  });
});
