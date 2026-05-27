import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireProtectedPageSessionMock = vi.fn();
const loadHomeLibraryPageDataExecuteMock = vi.fn();
const getHomeLibraryPageServicesMock = vi.fn(() => ({
  loadHomeLibraryPageData: {
    execute: loadHomeLibraryPageDataExecuteMock,
  },
}));

vi.mock('~/composition/server/auth', () => ({
  requireProtectedPageSession: requireProtectedPageSessionMock,
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
    requireProtectedPageSessionMock.mockResolvedValue({ id: 'session-1', userId: 'owner-1' });
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

    const result = await loader({
      request: new Request('http://localhost/?q=%20Action%20&tag=Action&tag=&tag=Drama'),
    } as never);

    expect(requireProtectedPageSessionMock).toHaveBeenCalledOnce();
    expect(getHomeLibraryPageServicesMock).toHaveBeenCalledOnce();
    expect(loadHomeLibraryPageDataExecuteMock).toHaveBeenCalledWith({
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
    });
    expect(result).toEqual({
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

    const result = await loader({
      request: new Request('http://localhost/?tag=%20Action%20'),
    } as never);

    expect(loadHomeLibraryPageDataExecuteMock).toHaveBeenCalledWith({
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
    });
    expect(result).toEqual({
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

  test('maps page-level composition failures to HTTP 500', async () => {
    loadHomeLibraryPageDataExecuteMock.mockResolvedValue({
      ok: false,
      reason: 'HOME_DATA_UNAVAILABLE',
    });
    const { loader } = await importHomeRoute();

    await expect(loader({
      request: new Request('http://localhost/'),
    } as never)).rejects.toMatchObject({
      status: 500,
    });
  });

  test('preserves q and tag query parameters when auth redirects unauthenticated requests to login', async () => {
    requireProtectedPageSessionMock.mockImplementation(async (request: Request) => {
      const url = new URL(request.url);
      const redirectTo = encodeURIComponent(url.pathname + url.search);

      throw new Response(null, {
        headers: {
          Location: `/login?redirectTo=${redirectTo}`,
        },
        status: 302,
      });
    });
    const { loader } = await importHomeRoute();

    await expect(loader({
      request: new Request('http://localhost/?q=Neo&tag=Action&tag=Drama'),
    } as never)).rejects.toMatchObject({
      headers: expect.any(Headers),
      status: 302,
    });

    try {
      await loader({
        request: new Request('http://localhost/?q=Neo&tag=Action&tag=Drama'),
      } as never);
    }
    catch (response) {
      expect((response as Response).headers.get('Location')).toBe('/login?redirectTo=%2F%3Fq%3DNeo%26tag%3DAction%26tag%3DDrama');
    }
  });

  test('does not revalidate the protected home loader for q/tag-only URL sync updates', async () => {
    const { shouldRevalidate } = await importHomeRoute();

    expect(shouldRevalidate({
      currentParams: {},
      currentUrl: new URL('http://localhost/?q=Action'),
      defaultShouldRevalidate: true,
      formAction: undefined,
      formData: undefined,
      formEncType: undefined,
      formMethod: undefined,
      nextParams: {},
      nextUrl: new URL('http://localhost/?q=Action&tag=Drama'),
    } as never)).toBe(false);

    expect(shouldRevalidate({
      currentParams: {},
      currentUrl: new URL('http://localhost/?q=Action'),
      defaultShouldRevalidate: true,
      formAction: undefined,
      formData: undefined,
      formEncType: undefined,
      formMethod: undefined,
      nextParams: {},
      nextUrl: new URL('http://localhost/playlists'),
    } as never)).toBe(true);
  });
});
