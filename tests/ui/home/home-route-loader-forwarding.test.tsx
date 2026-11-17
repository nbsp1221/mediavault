import type * as Router from 'react-router';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { HomePageProps } from '../../../app/pages/home/ui/HomePage';
import {
  createHomeLibraryFilters,
  writeHomeLibraryFiltersToSearchParams,
} from '../../../app/pages/home/model/home-library-filters';

const useLoaderDataMock = vi.fn<() => unknown>();
const useSearchParamsMock = vi.fn(
  () =>
    [
      new URLSearchParams('q=Action&tag=Good%20Boy-comedy&notTag=Spoiler&type=movie&genre=Drama'),
      vi.fn(),
    ] as const,
);
const homePageMock = vi.fn((props: HomePageProps) => (
  <div data-testid="mock-home-page">{JSON.stringify(props)}</div>
));
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof Router>('react-router');
  return {
    ...actual,
    useLoaderData: () => useLoaderDataMock(),
    useSearchParams: () => useSearchParamsMock(),
  };
});
vi.mock('~/pages/home/ui/HomePage', () => ({
  HomePage: (props: HomePageProps) => homePageMock(props),
}));

function snapshot() {
  return {
    contentTypes: [{ active: true, label: 'Movie', slug: 'movie', sortOrder: 10 }],
    genres: [{ active: true, label: 'Drama', slug: 'drama', sortOrder: 20 }],
    videos: [
      {
        contentTypeSlug: 'movie',
        createdAt: '2026-03-11T00:00:00.000Z',
        duration: 180,
        genreSlugs: ['drama'],
        id: 'video-1',
        tags: ['good_boy-comedy'],
        title: 'Catalog Fixture',
        isPrivate: false,
        permissions: { canEdit: true, canDelete: true, canManageVisibility: true },
        videoUrl: '/videos/video-1/manifest.mpd',
      },
    ],
  };
}

describe('Home URL and loader-data adaptation', () => {
  beforeEach(() => {
    homePageMock.mockClear();
    useLoaderDataMock.mockReturnValue(snapshot());
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('q=Action&tag=Good%20Boy-comedy&notTag=Spoiler&type=movie&genre=Drama'),
      vi.fn(),
    ] as const);
  });
  test('normalizes taxonomy and URL tags and revives dates for the page', async () => {
    const route = await import('../../../app/routes/_index');
    render(createElement(route.default));
    expect(screen.getByTestId('mock-home-page')).toBeInTheDocument();
    const props = homePageMock.mock.lastCall?.[0];
    expect(props).toMatchObject({
      initialFilters: {
        contentTypeSlug: 'movie',
        excludeTags: ['spoiler'],
        genreSlugs: ['drama'],
        includeTags: ['good boy-comedy'],
        query: 'Action',
      },
      videos: [{ contentTypeSlug: 'movie', genreSlugs: ['drama'], id: 'video-1' }],
    });
    expect(props?.videos[0]?.createdAt).toBeInstanceOf(Date);
  });
  test('preserves punctuation-only and underscore labels as actual text', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tag=Action&tag=__&tag=____&tag=--&notTag=___&notTag=Spoiler'),
      vi.fn(),
    ] as const);
    const route = await import('../../../app/routes/_index');
    render(createElement(route.default));
    expect(homePageMock.mock.lastCall?.[0]).toMatchObject({
      initialFilters: {
        excludeTags: ['___', 'spoiler'],
        includeTags: ['action', '__', '____', '--'],
      },
    });
  });
  test('round-trips NFC Korean, spaces, plus signs and URL punctuation without loss', async () => {
    const filters = createHomeLibraryFilters({
      query: 'C++',
      includeTags: ['가족 여행'.normalize('NFD'), 'C++', 'café', 'old_tag', 'x/y?z#1'],
      excludeTags: ['스포일러'],
    });
    const params = writeHomeLibraryFiltersToSearchParams(new URLSearchParams(), filters);
    const url = new URL(`http://localhost/?${params}`);
    expect(url.search).toContain('%2B%2B');
    expect(url.searchParams.getAll('tag')).toEqual([
      '가족 여행',
      'c++',
      'café',
      'old_tag',
      'x/y?z#1',
    ]);
    useSearchParamsMock.mockReturnValue([url.searchParams, vi.fn()] as const);
    const route = await import('../../../app/routes/_index');
    render(createElement(route.default));
    expect(homePageMock.mock.lastCall?.[0]?.initialFilters).toEqual(filters);
  });

  test('retains revived video references while the loader snapshot is unchanged', async () => {
    const route = await import('../../../app/routes/_index');
    const { rerender } = render(createElement(route.default));
    const first = homePageMock.mock.lastCall?.[0];
    rerender(createElement(route.default));
    const second = homePageMock.mock.lastCall?.[0];
    expect(first?.videos).toHaveLength(1);
    expect(first?.videos).toBe(second?.videos);
  });
});
