import { beforeEach, describe, expect, test, vi } from 'vitest';
import { routeArgs } from '../../helpers/route-args';

const resolveRequestViewerMock = vi.fn();
const loadOwnedVideoDetailsExecuteMock = vi.fn();
const getServerLibraryServicesMock = vi.fn(() => ({
  loadOwnedVideoDetails: {
    execute: loadOwnedVideoDetailsExecuteMock,
  },
}));

vi.mock('~/composition/server/auth', () => ({
  resolveRequestViewer: resolveRequestViewerMock,
}));

vi.mock('~/composition/server/library', () => ({
  getServerLibraryServices: getServerLibraryServicesMock,
}));

async function importVideoDetailsRoute() {
  return import('../../../app/routes/videos.$videoId.edit');
}

describe('video details route library slice adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resolveRequestViewerMock.mockResolvedValue({
      type: 'authenticated',
      userId: 'owner-1',
      username: 'owner',
    });
  });

  test('loads owner details through the library composition root without redirecting', async () => {
    loadOwnedVideoDetailsExecuteMock.mockResolvedValue({
      ok: true,
      data: {
        contentTypes: [{ active: true, label: 'Movie', slug: 'movie', sortOrder: 10 }],
        genres: [{ active: true, label: 'Action', slug: 'action', sortOrder: 10 }],
        video: {
          contentTypeSlug: 'movie',
          createdAt: new Date('2026-03-11T00:00:00.000Z'),
          description: 'A stored clip.',
          duration: 180,
          genreSlugs: ['action'],
          id: 'video-1',
          ownerId: 'owner-1',
          tags: ['Action'],
          thumbnailUrl: '/thumb.jpg',
          title: 'Catalog Fixture',
          videoUrl: '/videos/video-1/manifest.mpd',
          visibility: 'private',
        },
      },
    });
    const { loader } = await importVideoDetailsRoute();

    const response = await loader(
      routeArgs({
        params: { videoId: 'video-1' },
        request: new Request(
          'http://localhost/videos/video-1/edit?redirectTo=%2F%3Fq%3DAction%26tag%3DNeo',
        ),
      }),
    );

    expect(resolveRequestViewerMock).toHaveBeenCalledOnce();
    expect(getServerLibraryServicesMock).toHaveBeenCalledOnce();
    expect(loadOwnedVideoDetailsExecuteMock).toHaveBeenCalledWith({
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
      videoId: 'video-1',
    });
    const headers = new Headers(response.init?.headers);
    expect(headers.get('Cache-Control')).toBe('private, no-store');
    expect(headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(headers.get('Vary')).toBe('Cookie');
    const body = response.data;
    expect(Object.keys(body).sort()).toEqual(['contentTypes', 'genres', 'redirectTo', 'video']);
    expect(body).toMatchObject({
      contentTypes: [{ active: true, label: 'Movie', slug: 'movie', sortOrder: 10 }],
      genres: [{ active: true, label: 'Action', slug: 'action', sortOrder: 10 }],
      redirectTo: '/?q=Action&tag=Neo',
      video: {
        createdAt: '2026-03-11T00:00:00.000Z',
        id: 'video-1',
        isPrivate: true,
        permissions: {
          canDelete: true,
          canEdit: true,
          canManageVisibility: true,
        },
        title: 'Catalog Fixture',
      },
    });
  });

  test('rejects missing route params before hitting the library service', async () => {
    const { loader } = await importVideoDetailsRoute();

    await expect(
      loader(
        routeArgs({
          params: {},
          request: new Request('http://localhost/videos//edit'),
        }),
      ),
    ).rejects.toMatchObject({
      status: 400,
    });

    expect(loadOwnedVideoDetailsExecuteMock).not.toHaveBeenCalled();
  });

  test('builds route metadata from loaded video titles when available', async () => {
    const { meta } = await importVideoDetailsRoute();

    const loaderData = {
      contentTypes: [],
      genres: [],
      redirectTo: '/',
      video: {
        id: 'video-1',
        title: 'Catalog Fixture',
        createdAt: '2026-03-11T00:00:00.000Z',
        duration: 180,
        isPrivate: true,
        permissions: { canEdit: true, canDelete: true, canManageVisibility: true },
        tags: [],
        videoUrl: '/videos/video-1/manifest.mpd',
      },
    };
    const context: Parameters<typeof meta>[0] = {
      loaderData,
      location: {
        pathname: '/videos/video-1/edit',
        search: '',
        hash: '',
        state: null,
        key: 'test',
      },
      matches: [
        { id: 'root', pathname: '/', params: {}, meta: [], loaderData: { user: null } },
        {
          id: 'routes/videos.$videoId.edit',
          pathname: '/videos/video-1/edit',
          params: { videoId: 'video-1' },
          meta: [],
          loaderData,
        },
      ],
      params: { videoId: 'video-1' },
    };
    expect(meta(context)).toEqual([
      { title: 'Catalog Fixture - Video details' },
      { name: 'description', content: 'Manage video details' },
    ]);
    expect(meta({ ...context, loaderData: undefined })).toEqual([
      { title: 'Video details' },
      { name: 'description', content: 'Manage video details' },
    ]);
  });

  test('maps anonymous, non-owner, and missing videos to the same non-disclosing 404', async () => {
    const { loader } = await importVideoDetailsRoute();
    loadOwnedVideoDetailsExecuteMock.mockResolvedValue({
      message: 'Video not found',
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });

    for (const request of [
      new Request('http://localhost/videos/public-video/edit'),
      new Request('http://localhost/videos/other-public-video/edit'),
      new Request('http://localhost/videos/missing-video/edit'),
    ]) {
      await expect(
        loader(
          routeArgs({
            params: { videoId: request.url.split('/videos/')[1].split('/edit')[0] },
            request,
          }),
        ),
      ).rejects.toMatchObject({
        status: 404,
      });
    }
  });

  test('does not collapse source-unavailable failures into the non-disclosing 404', async () => {
    const { loader } = await importVideoDetailsRoute();
    loadOwnedVideoDetailsExecuteMock.mockResolvedValue({
      message: 'Unable to load video details',
      ok: false,
      reason: 'VIDEO_DETAILS_SOURCE_UNAVAILABLE',
    });

    await expect(
      loader(
        routeArgs({
          params: { videoId: 'video-1' },
          request: new Request('http://localhost/videos/video-1/edit'),
        }),
      ),
    ).rejects.toMatchObject({
      status: 500,
    });
  });

  test('sanitizes external return targets to the library fallback', async () => {
    loadOwnedVideoDetailsExecuteMock.mockResolvedValue({
      ok: true,
      data: {
        contentTypes: [],
        genres: [],
        video: {
          createdAt: new Date('2026-03-11T00:00:00.000Z'),
          duration: 180,
          id: 'video-1',
          ownerId: 'owner-1',
          tags: [],
          title: 'Catalog Fixture',
          videoUrl: '/videos/video-1/manifest.mpd',
          visibility: 'public',
        },
      },
    });
    const { loader } = await importVideoDetailsRoute();

    const response = await loader(
      routeArgs({
        params: { videoId: 'video-1' },
        request: new Request(
          'http://localhost/videos/video-1/edit?redirectTo=https%3A%2F%2Fexample.com',
        ),
      }),
    );

    expect(response.data).toMatchObject({
      redirectTo: '/',
    });
  });
});
