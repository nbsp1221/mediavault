import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, test, vi } from 'vitest';

import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { HomePage } from '../../../app/pages/home/ui/HomePage';

const rootLoaderDataMock = vi.fn(() => ({
  user: {
    email: 'owner@example.com',
    id: 'user-1',
    role: 'admin',
  },
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    useRouteLoaderData: () => rootLoaderDataMock(),
  };
});

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
    tags: ['Action', 'Neo', 'Vault'],
    thumbnailUrl: '/thumb.jpg',
    title: 'Catalog Fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    ...overrides,
  };
}

function renderHomeShell() {
  render(
    <MemoryRouter>
      <HomePage
        initialFilters={{ query: '' }}
        videos={[createVideo()]}
      />
    </MemoryRouter>,
  );
}

describe('Home shell contract', () => {
  test('renders the approved sidebar, header, and shell affordances in the correct order', () => {
    render(
      <MemoryRouter>
        <HomePage
          initialFilters={{ query: '' }}
          videos={[createVideo()]}
        />
      </MemoryRouter>,
    );

    const libraryHeading = screen.getByRole('heading', { level: 3, name: 'Library' });
    const manageHeading = screen.getByRole('heading', { level: 3, name: 'Manage' });
    const settingsHeading = screen.getByRole('heading', { level: 3, name: 'Settings' });
    const homeLink = screen.getByRole('link', { name: 'All Videos' });
    const playlistsLink = screen.getByRole('link', { name: 'Playlists' });
    const uploadLink = screen.getAllByRole('link', { name: /Upload/i })[0];
    const settingsLink = screen.getByRole('link', { name: 'Settings' });
    const desktopSearch = screen.getAllByPlaceholderText('Search titles and tags...')[0];
    const filtersButton = screen.getByRole('button', { name: 'Filters' });
    const accountMenu = screen.getByTitle('Account Menu');

    expect(screen.getByText('Mediavault')).toBeInTheDocument();
    expect(libraryHeading.compareDocumentPosition(manageHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(manageHeading.compareDocumentPosition(settingsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(homeLink).toHaveAttribute('href', '/');
    expect(screen.queryByRole('heading', { level: 3, name: 'Browse' })).not.toBeInTheDocument();
    expect(playlistsLink).toHaveAttribute('href', '/playlists');
    expect(uploadLink).toHaveAttribute('href', '/add-videos');
    expect(settingsLink).toHaveAttribute('href', '/settings');
    expect(desktopSearch).toBeInTheDocument();
    expect(filtersButton).toBeInTheDocument();
    expect(accountMenu).toBeInTheDocument();
  });

  test('renders desktop and mobile search controls with the approved placeholder', () => {
    render(
      <MemoryRouter>
        <HomePage
          initialFilters={{ query: 'Action' }}
          videos={[createVideo()]}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByPlaceholderText('Search titles and tags...')).toHaveLength(2);
    expect(screen.getAllByDisplayValue('Action')).toHaveLength(2);
  });

  test('preserves q/tag/type/genre URL state when home navigation returns to all videos', async () => {
    const user = userEvent.setup();

    function LocationProbe() {
      const location = useLocation();
      return <output data-testid="location-search">{location.search}</output>;
    }

    render(
      <MemoryRouter initialEntries={['/?q=Action&tag=action&notTag=spoiler&type=movie&genre=action']}>
        <HomePage
          initialFilters={{
            contentTypeSlug: 'movie',
            excludeTags: ['spoiler'],
            genreSlugs: ['action'],
            includeTags: ['action'],
            query: 'Action',
          }}
          videos={[createVideo()]}
        />
        <LocationProbe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: 'All Videos' }));

    const nextSearch = new URLSearchParams(screen.getByTestId('location-search').textContent ?? '');
    expect(nextSearch.get('q')).toBe('Action');
    expect(nextSearch.getAll('tag')).toEqual(['action']);
    expect(nextSearch.getAll('notTag')).toEqual(['spoiler']);
    expect(nextSearch.get('type')).toBe('movie');
    expect(nextSearch.getAll('genre')).toEqual(['action']);
  });

  test('opens an accessible mobile navigation drawer', async () => {
    const user = userEvent.setup();
    renderHomeShell();

    const toggleButton = screen.getByRole('button', { name: 'Toggle sidebar menu' });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();

    await user.click(toggleButton);

    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeInTheDocument();
  });

  test('closes the mobile navigation drawer through the All Videos navigation link', async () => {
    const user = userEvent.setup();
    renderHomeShell();

    const toggleButton = screen.getByRole('button', { name: 'Toggle sidebar menu' });
    await user.click(toggleButton);
    expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'All Videos' }));
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
  });

  test('closes the mobile navigation drawer through the brand navigation link', async () => {
    const user = userEvent.setup();
    renderHomeShell();

    const toggleButton = screen.getByRole('button', { name: 'Toggle sidebar menu' });
    await user.click(toggleButton);
    expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Mediavault' }));
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
  });

  test('closes the mobile navigation drawer with Escape', async () => {
    const user = userEvent.setup();
    renderHomeShell();

    const toggleButton = screen.getByRole('button', { name: 'Toggle sidebar menu' });
    await user.click(toggleButton);
    expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
  });

  test('closes the mobile navigation drawer when resized to desktop width', async () => {
    const user = userEvent.setup();
    renderHomeShell();

    await user.click(screen.getByRole('button', { name: 'Toggle sidebar menu' }));
    expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeInTheDocument();

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
    });
  });
});
