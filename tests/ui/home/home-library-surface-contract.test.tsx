import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';

import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { HomePage } from '../../../app/pages/home/ui/HomePage';

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    useRouteLoaderData: () => ({
      user: {
        email: 'owner@example.com',
        id: 'user-1',
        role: 'admin',
      },
    }),
  };
});

function createVideo(overrides: Partial<HomeLibraryVideo> = {}): HomeLibraryVideo {
  return {
    createdAt: new Date('2026-03-11T00:00:00.000Z'),
    description: 'A stored vault clip.',
    duration: 180,
    id: 'video-1',
    isPrivate: false,
    permissions: {
      canDelete: true,
      canEdit: true,
      canManageVisibility: true,
    },
    tags: ['Action', 'Neo', 'Vault', 'Hidden'],
    thumbnailUrl: '/thumb.jpg',
    title: 'Catalog Fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    ...overrides,
  };
}

describe('Home library surface contract', () => {
  test('renders the approved heading, card surface, tags, and quick-view action menu affordances', async () => {
    const user = userEvent.setup();
    const expectedDate = new Intl.DateTimeFormat('en-US').format(new Date('2026-03-11T00:00:00.000Z'));

    render(
      <MemoryRouter>
        <HomePage
          initialFilters={{ query: '' }}
          videos={[createVideo()]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'My Library' })).toBeInTheDocument();
    expect(screen.getByText('Total 1 videos • Showing 1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Catalog Fixture' })).toBeInTheDocument();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
    expect(screen.getByText('3:00')).toBeInTheDocument();
    expect(screen.getByText('#Action')).toBeInTheDocument();
    expect(screen.getByText('#Neo')).toBeInTheDocument();
    expect(screen.getByText('#Vault')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open actions menu' }));
    expect(screen.getByRole('menuitem', { name: 'Quick view' })).toBeVisible();
  });

  test('renders the approved modal, edit, and delete-confirm flows', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <HomePage
          initialFilters={{ includeTags: ['Action'], query: '' }}
          videos={[createVideo()]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Active filters:')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open actions menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Quick view' }));

    expect(screen.getByRole('heading', { name: 'Catalog Fixture' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Description' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tags' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Info' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    const quickViewDialog = screen.getByRole('dialog', { name: 'Catalog Fixture' });
    expect(within(quickViewDialog).getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Edit Info' }));
    expect(screen.getByRole('heading', { name: 'Edit Video Information' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Catalog Fixture');
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Neo')).toBeInTheDocument();
    expect(screen.getByText('Vault')).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toHaveValue('A stored vault clip.');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const deleteDialog = screen.getByRole('dialog', { name: 'Delete Video' });
    expect(deleteDialog).toHaveTextContent('This action cannot be undone.');
  });

  test('renders the approved empty-state copy', () => {
    render(
      <MemoryRouter>
        <HomePage
          initialFilters={{ query: '' }}
          videos={[]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('No videos found.')).toBeInTheDocument();
  });
});
