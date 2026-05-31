import { beforeEach, describe, expect, test, vi } from 'vitest';

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

    const response = await loader({
      params: { videoId: 'video-1' },
      request: new Request('http://localhost/videos/video-1/edit?redirectTo=%2F%3Fq%3DAction%26tag%3DNeo'),
    } as never);

    expect(resolveRequestViewerMock).toHaveBeenCalledOnce();
    expect(getServerLibraryServicesMock).toHaveBeenCalledOnce();
    expect(loadOwnedVideoDetailsExecuteMock).toHaveBeenCalledWith({
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
      videoId: 'video-1',
    });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Vary')).toBe('Cookie');
    await expect(response.json()).resolves.toEqual({
      contentTypes: [{ active: true, label: 'Movie', slug: 'movie', sortOrder: 10 }],
      genres: [{ active: true, label: 'Action', slug: 'action', sortOrder: 10 }],
      redirectTo: '/?q=Action&tag=Neo',
      video: expect.objectContaining({
        createdAt: '2026-03-11T00:00:00.000Z',
        id: 'video-1',
        isPrivate: true,
        permissions: {
          canDelete: true,
          canEdit: true,
          canManageVisibility: true,
        },
        title: 'Catalog Fixture',
      }),
    });
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
      await expect(loader({
        params: { videoId: request.url.split('/videos/')[1].split('/edit')[0] },
        request,
      } as never)).rejects.toMatchObject({
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

    await expect(loader({
      params: { videoId: 'video-1' },
      request: new Request('http://localhost/videos/video-1/edit'),
    } as never)).rejects.toMatchObject({
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

    const response = await loader({
      params: { videoId: 'video-1' },
      request: new Request('http://localhost/videos/video-1/edit?redirectTo=https%3A%2F%2Fexample.com'),
    } as never);

    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      redirectTo: '/',
    }));
  });
});
