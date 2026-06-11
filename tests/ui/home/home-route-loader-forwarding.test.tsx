import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, test, vi } from 'vitest';

const useLoaderDataMock = vi.fn();
const useSearchParamsMock = vi.fn(() => [
  new URLSearchParams('q=Action&tag=Good%20Boy-comedy&notTag=Spoiler&type=movie&genre=Drama'),
  vi.fn(),
] as const);
const homePageMock = vi.fn((props: unknown) => (
  <div data-testid="mock-home-page">{JSON.stringify(props)}</div>
));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    useLoaderData: () => useLoaderDataMock(),
    useSearchParams: () => useSearchParamsMock(),
  };
});

vi.mock('~/pages/home/ui/HomePage', () => ({
  HomePage: (props: unknown) => homePageMock(props),
}));

describe('HomeRoute loader forwarding', () => {
  test('passes initialFilters and videos through to the new HomePage owner', async () => {
    useLoaderDataMock.mockReturnValue({
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
          videoUrl: '/videos/video-1/manifest.mpd',
        },
      ],
    });
    const routeModule = await import('../../../app/routes/_index');

    render(React.createElement(routeModule.default));

    expect(screen.getByTestId('mock-home-page')).toBeInTheDocument();
    expect(homePageMock).toHaveBeenCalledWith(expect.objectContaining({
      initialFilters: {
        contentTypeSlug: 'movie',
        excludeTags: ['spoiler'],
        genreSlugs: ['drama'],
        includeTags: ['good_boy-comedy'],
        query: 'Action',
      },
      contentTypes: [{ active: true, label: 'Movie', slug: 'movie', sortOrder: 10 }],
      genres: [{ active: true, label: 'Drama', slug: 'drama', sortOrder: 20 }],
      videos: [
        expect.objectContaining({
          contentTypeSlug: 'movie',
          createdAt: expect.any(Date),
          genreSlugs: ['drama'],
          id: 'video-1',
        }),
      ],
    }));
  });

  test('drops URL tag filters that would render as blank filter labels', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tag=Action&tag=__&tag=____&tag=--&notTag=___&notTag=Spoiler'),
      vi.fn(),
    ] as const);
    useLoaderDataMock.mockReturnValue({
      contentTypes: [],
      genres: [],
      videos: [],
    });
    const routeModule = await import('../../../app/routes/_index');

    render(React.createElement(routeModule.default));

    expect(homePageMock).toHaveBeenCalledWith(expect.objectContaining({
      initialFilters: expect.objectContaining({
        excludeTags: ['spoiler'],
        includeTags: ['action'],
      }),
    }));
  });

  test('keeps deserialized video references stable across same-snapshot rerenders', async () => {
    const loaderSnapshot = {
      contentTypes: [],
      genres: [],
      videos: [
        {
          contentTypeSlug: 'movie',
          createdAt: '2026-03-11T00:00:00.000Z',
          duration: 180,
          genreSlugs: ['action'],
          id: 'video-1',
          tags: ['Action'],
          title: 'Catalog Fixture',
          videoUrl: '/videos/video-1/manifest.mpd',
        },
      ],
    };
    useLoaderDataMock.mockReturnValue(loaderSnapshot);
    const routeModule = await import('../../../app/routes/_index');
    const { rerender } = render(React.createElement(routeModule.default));

    const firstCallProps = homePageMock.mock.lastCall?.[0] as {
      videos: Array<{ id: string }>;
    };

    rerender(React.createElement(routeModule.default));

    const secondCallProps = homePageMock.mock.lastCall?.[0] as {
      videos: Array<{ id: string }>;
    };

    expect(firstCallProps.videos).toBe(secondCallProps.videos);
  });
});
