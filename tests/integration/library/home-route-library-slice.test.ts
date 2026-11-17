import { beforeEach, describe, expect, test, vi } from 'vitest';
import { routeArgs } from '../../helpers/route-args';

const resolvePublicVideoAccessMock = vi.fn();
const loadHomeLibraryPageDataExecuteMock = vi.fn();
const getHomeLibraryPageServicesMock = vi.fn(() => ({
  loadHomeLibraryPageData: {
    execute: loadHomeLibraryPageDataExecuteMock,
  },
}));

vi.mock('~/composition/server/auth', () => ({
  resolvePublicVideoAccess: resolvePublicVideoAccessMock,
}));

vi.mock('~/composition/server/home-library-page', () => ({
  getHomeLibraryPageServices: getHomeLibraryPageServicesMock,
}));

async function importHomeRoute() {
  return import('../../../app/routes/_index');
}

describe('home route library slice adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resolvePublicVideoAccessMock.mockResolvedValue({
      headers: new Headers({
        'Cache-Control': 'private, no-store',
        'Vary': 'Cookie',
      }),
      viewer: { type: 'authenticated', userId: 'owner-1' },
    });
  });

  test('delegates home page loading to the page-level composition root and preserves the established loader contract', async () => {
    loadHomeLibraryPageDataExecuteMock.mockResolvedValue({
      ok: true,
      data: {
        contentTypes: [],
        genres: [],
        videos: [
          {
            createdAt: new Date('2026-03-11T00:00:00.000Z'),
            duration: 180,
            id: 'video-1',
            isPrivate: false,
            permissions: {
              canDelete: true,
              canEdit: true,
              canManageVisibility: true,
            },
            tags: ['Action'],
            title: 'Catalog Fixture',
            videoUrl: '/videos/video-1/manifest.mpd',
          },
        ],
      },
    });
    const { loader } = await importHomeRoute();

    const result = await loader(
      routeArgs({
        request: new Request('http://localhost/?q=%20Action%20&tag=Action&tag=Drama'),
      }),
    );

    expect(resolvePublicVideoAccessMock).toHaveBeenCalledOnce();
    expect(getHomeLibraryPageServicesMock).toHaveBeenCalledOnce();
    expect(loadHomeLibraryPageDataExecuteMock).toHaveBeenCalledWith({
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
    });
    await expect(result.json()).resolves.toEqual({
      contentTypes: [],
      genres: [],
      videos: [
        expect.objectContaining({
          createdAt: '2026-03-11T00:00:00.000Z',
          id: 'video-1',
          isPrivate: false,
          permissions: {
            canDelete: true,
            canEdit: true,
            canManageVisibility: true,
          },
          title: 'Catalog Fixture',
        }),
      ],
    });
    expect(result.headers.get('Cache-Control')).toBe('private, no-store');
    expect(result.headers.get('Vary')).toBe('Cookie');
  });

  test('returns trimmed bootstrap tags so the current HomePage tag matcher keeps working for direct-navigation URLs', async () => {
    loadHomeLibraryPageDataExecuteMock.mockResolvedValue({
      ok: true,
      data: {
        contentTypes: [],
        genres: [],
        videos: [
          {
            createdAt: new Date('2026-03-11T00:00:00.000Z'),
            duration: 180,
            id: 'video-1',
            isPrivate: false,
            permissions: {
              canDelete: true,
              canEdit: true,
              canManageVisibility: true,
            },
            tags: ['Action'],
            title: 'Catalog Fixture',
            videoUrl: '/videos/video-1/manifest.mpd',
          },
        ],
      },
    });
    const { loader } = await importHomeRoute();

    const result = await loader(
      routeArgs({
        request: new Request('http://localhost/?tag=%20Action%20'),
      }),
    );

    expect(loadHomeLibraryPageDataExecuteMock).toHaveBeenCalledWith({
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
    });
    await expect(result.json()).resolves.toEqual({
      contentTypes: [],
      genres: [],
      videos: [
        expect.objectContaining({
          createdAt: '2026-03-11T00:00:00.000Z',
          id: 'video-1',
        }),
      ],
    });
  });

  test.each(['tag=', 'notTag=', 'tag=bad%00tag'])(
    'rejects malformed tag filter %s before loading data',
    async (query) => {
      const { loader } = await importHomeRoute();
      await expect(
        loader(routeArgs({ request: new Request(`http://localhost/?${query}`) })),
      ).rejects.toMatchObject({ status: 400 });
      expect(getHomeLibraryPageServicesMock).not.toHaveBeenCalled();
    },
  );

  test('maps page-level composition failures to HTTP 500', async () => {
    loadHomeLibraryPageDataExecuteMock.mockResolvedValue({
      ok: false,
      reason: 'HOME_DATA_UNAVAILABLE',
    });
    const { loader } = await importHomeRoute();

    await expect(
      loader(
        routeArgs({
          request: new Request('http://localhost/'),
        }),
      ),
    ).rejects.toMatchObject({
      status: 500,
    });
  });

  test('loads anonymous home data through the public viewer instead of redirecting to login', async () => {
    resolvePublicVideoAccessMock.mockResolvedValue({
      headers: new Headers({
        'Cache-Control': 'private, no-store',
        'Vary': 'Cookie',
      }),
      viewer: { type: 'anonymous' },
    });
    loadHomeLibraryPageDataExecuteMock.mockResolvedValue({
      ok: true,
      data: {
        contentTypes: [],
        genres: [],
        videos: [],
      },
    });
    const { loader } = await importHomeRoute();

    const result = await loader(
      routeArgs({
        request: new Request('http://localhost/?q=Neo&tag=Action&tag=Drama'),
      }),
    );

    expect(loadHomeLibraryPageDataExecuteMock).toHaveBeenCalledWith({
      viewer: { type: 'anonymous' },
    });
    expect(result.status).toBe(200);
  });

  test('does not revalidate the protected home loader for q/tag-only URL sync updates', async () => {
    const { shouldRevalidate } = await importHomeRoute();

    expect(
      shouldRevalidate({
        currentUrl: new URL('http://localhost/?q=Action'),
        defaultShouldRevalidate: true,
        nextUrl: new URL('http://localhost/?q=Action&tag=Drama'),
      }),
    ).toBe(false);

    expect(
      shouldRevalidate({
        currentUrl: new URL('http://localhost/?q=Action'),
        defaultShouldRevalidate: true,
        nextUrl: new URL('http://localhost/playlists'),
      }),
    ).toBe(true);
  });
});
