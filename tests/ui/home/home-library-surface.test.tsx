import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { LibraryVideoCard } from '../../../app/entities/library-video/ui/LibraryVideoCard';
import { createHomeLibraryFilters } from '../../../app/pages/home/model/home-library-filters';
import { HomeAppliedFiltersBar } from '../../../app/pages/home/ui/HomeAppliedFiltersBar';
import { HomePage } from '../../../app/pages/home/ui/HomePage';

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
    tags: ['Action', 'Neo', 'Vault'],
    thumbnailUrl: '/thumb.jpg',
    title: 'Catalog Fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    ...overrides,
  };
}

function RouteOwnedHomePage({ videos }: { videos: HomeLibraryVideo[] }) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);

  return (
    <HomePage
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
    const expectedDate = new Intl.DateTimeFormat('en-US').format(
      new Date('2026-03-11T00:00:00.000Z'),
    );
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
    expect(screen.getByRole('button', { name: '#good_boy-comedy' })).toBeInTheDocument();
    expect(screen.getByText('3:00')).toBeInTheDocument();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });

  test('applied filters remove individual tags and offer a clear-all action', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClearAll = vi.fn();
    render(
      <HomeAppliedFiltersBar
        contentTypes={[]}
        genres={[]}
        filters={createHomeLibraryFilters({ includeTags: ['action', 'drama'] })}
        onClearAll={onClearAll}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove required action tag' }));
    expect(onChange).toHaveBeenCalledWith(createHomeLibraryFilters({ includeTags: ['drama'] }));
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalledOnce();
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

  test('HomePage renders a lightweight empty state when no videos match', () => {
    render(
      <MemoryRouter>
        <HomePage
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

  test('HomePage syncs search and tag filters back into the URL', async () => {
    const user = userEvent.setup();

    function LocationProbe() {
      const location = useLocation();
      return <output data-testid="location-search">{location.search}</output>;
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage
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

  test('HomePage preserves literal punctuation and underscores in applied tag chips', () => {
    render(
      <MemoryRouter
        initialEntries={['/?tag=Action&tag=__&tag=____&tag=--&notTag=____&notTag=Spoiler']}
      >
        <RouteOwnedHomePage
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
    expect(screen.getByRole('button', { name: 'Remove required __ tag' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove required -- tag' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove required tag' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove excluded tag' })).not.toBeInTheDocument();
  });

  test('filters actual library cards using composed-equivalent Korean and literal plus signs', () => {
    const params = new URLSearchParams({ q: '가족'.normalize('NFD') });
    params.append('tag', '가족 여행');
    params.append('tag', 'C++');
    render(
      <MemoryRouter initialEntries={[`/?${params}`]}>
        <RouteOwnedHomePage
          videos={[
            createVideo({ title: 'Unicode match', tags: ['가족 여행', 'c++'] }),
            createVideo({
              id: 'video-2',
              title: 'Different punctuation',
              tags: ['가족 여행', 'c'],
            }),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Unicode match' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Different punctuation' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove required c++ tag' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove required 가족 여행 tag' }),
    ).toBeInTheDocument();
  });

  test('HomePage resyncs visible filters when same-route URL navigation changes q/tag state', async () => {
    const user = userEvent.setup();

    function NavigationControls() {
      const navigate = useNavigate();

      return (
        <>
          <button type="button" onClick={() => void navigate('/')}>
            Clear URL filters
          </button>
          <button type="button" onClick={() => void navigate('/?q=Action')}>
            Restore Action URL
          </button>
          <button type="button" onClick={() => void navigate(-1)}>
            Go back
          </button>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={['/?q=Action']}>
        <RouteOwnedHomePage
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

  test('HomePage preserves same-route filter history so browser back restores prior filter state', async () => {
    const user = userEvent.setup();

    function HistoryControls() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => void navigate(-1)}>
          Go back
        </button>
      );
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteOwnedHomePage
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
    expect(
      screen.queryByRole('button', { name: 'Remove required action tag' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search library (desktop)')).toHaveValue('Action');
  });
});
