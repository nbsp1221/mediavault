import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { describe, expect, test, vi } from 'vitest';

import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { LibraryVideoCard } from '../../../app/entities/library-video/ui/LibraryVideoCard';
import { HomeQuickViewDialog } from '../../../app/features/home-quick-view/ui/HomeQuickViewDialog';
import { HomeTagFilter } from '../../../app/features/home-tag-filter/ui/HomeTagFilter';
import { HomeLibraryWidget } from '../../../app/widgets/home-library/ui/HomeLibraryWidget';

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

function RouteOwnedHomeLibraryWidget({ videos }: { videos: HomeLibraryVideo[] }) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);

  return (
    <HomeLibraryWidget
      initialFilters={{
        excludeTags: searchParams.getAll('notTag'),
        includeTags: searchParams.getAll('tag'),
        query: searchParams.get('q') ?? '',
      }}
      videos={videos}
    />
  );
}

describe('home library surfaces', () => {
  test('LibraryVideoCard renders title, keyboard-accessible tag actions, date, and duration', () => {
    const expectedDate = new Intl.DateTimeFormat('en-US').format(new Date('2026-03-11T00:00:00.000Z'));
    const onTagClick = vi.fn();

    render(
      <MemoryRouter>
        <LibraryVideoCard
          onTagClick={onTagClick}
          video={createVideo({ tags: ['good_boy-comedy'] })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Catalog Fixture' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#good boy-comedy' })).toBeInTheDocument();
    expect(screen.getByText('3:00')).toBeInTheDocument();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });

  test('HomeTagFilter renders active tags and clear-all actions', async () => {
    const user = userEvent.setup();
    const onTagRemove = vi.fn();
    const onClearAll = vi.fn();

    render(
      <HomeTagFilter
        activeTags={['Action', 'Drama']}
        onClearAll={onClearAll}
        onTagRemove={onTagRemove}
      />,
    );

    expect(screen.getByText('Active filters:')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove #Action filter' }));
    await user.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(onTagRemove).toHaveBeenCalledWith('Action');
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  test('HomeQuickViewDialog renders title, description, tags, and watch affordance', () => {
    render(
      <MemoryRouter>
        <HomeQuickViewDialog
          isOpen
          modalState={{
            isOpen: true,
            video: createVideo({
              description: 'A stored vault clip.',
              tags: ['good_boy-comedy'],
            }),
          }}
          onClose={vi.fn()}
          onDeleteVideo={vi.fn()}
          onTagClick={vi.fn()}
          onUpdateVideo={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Catalog Fixture' })).toBeInTheDocument();
    expect(screen.getByText('A stored vault clip.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#good boy-comedy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Watch' })).toHaveAttribute('href', '/player/video-1');
  });

  test('HomeQuickViewDialog hides management actions for read-only videos', () => {
    render(
      <MemoryRouter>
        <HomeQuickViewDialog
          isOpen
          modalState={{
            isOpen: true,
            video: createVideo({
              permissions: {
                canDelete: false,
                canEdit: false,
                canManageVisibility: false,
              },
            }),
          }}
          onClose={vi.fn()}
          onDeleteVideo={vi.fn()}
          onTagClick={vi.fn()}
          onUpdateVideo={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Watch' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Info' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  test('LibraryVideoCard shows private badge only for private videos', () => {
    const { rerender } = render(
      <MemoryRouter>
        <LibraryVideoCard video={createVideo({ isPrivate: true })} />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Private video')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <LibraryVideoCard video={createVideo({ isPrivate: false })} />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText('Private video')).not.toBeInTheDocument();
  });

  test('HomeLibraryWidget renders a lightweight empty state when no videos match', () => {
    render(
      <MemoryRouter>
        <HomeLibraryWidget
          initialFilters={{
            includeTags: [],
            query: '',
          }}
          videos={[]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('No videos found.')).toBeInTheDocument();
  });

  test('HomeLibraryWidget syncs search and tag filters back into the URL', async () => {
    const user = userEvent.setup();

    function LocationProbe() {
      const location = useLocation();
      return <output data-testid="location-search">{location.search}</output>;
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <HomeLibraryWidget
          initialFilters={{
            includeTags: [],
            query: '',
          }}
          videos={[createVideo()]}
        />
        <LocationProbe />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Search library (desktop)'), 'Action');
    expect(screen.getByTestId('location-search')).toHaveTextContent('?q=Action');

    await user.click(screen.getByRole('button', { name: '#Action' }));
    expect(screen.getByTestId('location-search')).toHaveTextContent('?q=Action&tag=action');
  });

  test('HomeLibraryWidget drops URL tag filters that would render blank applied chips', () => {
    render(
      <MemoryRouter initialEntries={['/?tag=Action&tag=__&tag=____&tag=--&notTag=____&notTag=Spoiler']}>
        <RouteOwnedHomeLibraryWidget
          videos={[
            createVideo(),
            createVideo({
              id: 'video-2',
              tags: ['Spoiler'],
              title: 'Hidden Fixture',
            }),
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Remove required action tag' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove excluded spoiler tag' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove required tag' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove excluded tag' })).not.toBeInTheDocument();
  });

  test('HomeLibraryWidget resyncs visible filters when same-route URL navigation changes q/tag state', async () => {
    const user = userEvent.setup();

    function NavigationControls() {
      const navigate = useNavigate();

      return (
        <>
          <button type="button" onClick={() => navigate('/')}>
            Clear URL filters
          </button>
          <button type="button" onClick={() => navigate('/?q=Action')}>
            Restore Action URL
          </button>
          <button type="button" onClick={() => navigate(-1)}>
            Go back
          </button>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={['/?q=Action']}>
        <RouteOwnedHomeLibraryWidget
          videos={[
            createVideo(),
            createVideo({
              id: 'video-2',
              tags: ['Drama'],
              title: 'Second Fixture',
            }),
          ]}
        />
        <NavigationControls />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Search library (desktop)')).toHaveValue('Action');
    expect(screen.queryByText('Second Fixture')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear URL filters' }));
    expect(screen.getByLabelText('Search library (desktop)')).toHaveValue('');
    expect(screen.getByText('Second Fixture')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restore Action URL' }));
    expect(screen.getByLabelText('Search library (desktop)')).toHaveValue('Action');
    expect(screen.queryByText('Second Fixture')).not.toBeInTheDocument();
  });

  test('HomeLibraryWidget preserves same-route filter history so browser back restores prior filter state', async () => {
    const user = userEvent.setup();

    function HistoryControls() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate(-1)}>
          Go back
        </button>
      );
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteOwnedHomeLibraryWidget
          videos={[
            createVideo(),
            createVideo({
              id: 'video-2',
              tags: ['Drama'],
              title: 'Second Fixture',
            }),
          ]}
        />
        <HistoryControls />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Search library (desktop)'), 'Action');
    expect(screen.getByLabelText('Search library (desktop)')).toHaveValue('Action');

    await user.click(screen.getByRole('button', { name: '#Action' }));
    expect(screen.getByRole('button', { name: 'Remove required action tag' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.queryByRole('button', { name: 'Remove required action tag' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search library (desktop)')).toHaveValue('Action');
  });
});
