import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const resolvePublicVideoAccessMock = vi.fn();
const useLoaderDataMock = vi.fn();
const fakePlaybackServices = {
  resolvePlayerVideo: {
    execute: vi.fn(),
  },
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    useLoaderData: () => useLoaderDataMock(),
  };
});

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => null,
}));

vi.mock('~/composition/server/auth', () => ({
  resolvePublicVideoAccess: resolvePublicVideoAccessMock,
}));

vi.mock('~/composition/server/playback', () => ({
  getServerPlaybackServices: () => fakePlaybackServices,
}));

async function importPlayerRoute() {
  return import('../../../app/routes/player.$id');
}

describe('player route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    useLoaderDataMock.mockReset();
    fakePlaybackServices.resolvePlayerVideo.execute.mockReset();
    resolvePublicVideoAccessMock.mockResolvedValue({
      headers: new Headers({
        'Cache-Control': 'private, no-store',
        'Vary': 'Cookie',
      }),
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
    });
  });

  test('loads player data through the playback composition root instead of a route-owned repository', async () => {
    fakePlaybackServices.resolvePlayerVideo.execute.mockResolvedValue({
      ok: true,
      relatedVideos: [],
      video: {
        createdAt: new Date('2026-03-09T00:00:00.000Z'),
        duration: 120,
        id: 'video-1',
        tags: ['vault'],
        title: 'Player Fixture',
        videoUrl: '/videos/video-1/manifest.mpd',
      },
    });
    const { loader } = await importPlayerRoute();

    const response = await loader({
      params: { id: 'video-1' },
      request: new Request('http://localhost/player/video-1'),
    } as never);

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Vary')).toBe('Cookie');
    expect(fakePlaybackServices.resolvePlayerVideo.execute).toHaveBeenCalledWith({
      readScope: {
        ownerId: 'owner-1',
        type: 'public_or_owned',
      },
      videoId: 'video-1',
    });
    await expect(response.json()).resolves.toEqual({
      relatedVideos: [],
      video: {
        createdAt: '2026-03-09T00:00:00.000Z',
        duration: 120,
        id: 'video-1',
        tags: ['vault'],
        title: 'Player Fixture',
        videoUrl: '/videos/video-1/manifest.mpd',
      },
    });
  });

  test('returns a 404 response when the playback composition cannot resolve the video', async () => {
    fakePlaybackServices.resolvePlayerVideo.execute.mockResolvedValue({
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });
    const { loader } = await importPlayerRoute();

    await expect(loader({
      params: { id: 'missing-video' },
      request: new Request('http://localhost/player/missing-video'),
    } as never)).rejects.toMatchObject({
      status: 404,
    });
  });

  test('uses public-only scope for anonymous player reads without redirecting to login', async () => {
    resolvePublicVideoAccessMock.mockResolvedValue({
      headers: new Headers({
        'Cache-Control': 'private, no-store',
        'Vary': 'Cookie',
      }),
      viewer: { type: 'anonymous' },
    });
    fakePlaybackServices.resolvePlayerVideo.execute.mockResolvedValue({
      ok: true,
      relatedVideos: [],
      video: {
        createdAt: new Date('2026-03-09T00:00:00.000Z'),
        duration: 120,
        id: 'video-1',
        tags: ['vault'],
        title: 'Player Fixture',
        videoUrl: '/videos/video-1/manifest.mpd',
      },
    });
    const { loader } = await importPlayerRoute();

    const response = await loader({
      params: { id: 'video-1' },
      request: new Request('http://localhost/player/video-1'),
    } as never);

    expect(response.status).toBe(200);
    expect(fakePlaybackServices.resolvePlayerVideo.execute).toHaveBeenCalledWith({
      readScope: {
        type: 'public_only',
      },
      videoId: 'video-1',
    });
  });

  test('renders serialized loader data through the shell-backed player route', async () => {
    useLoaderDataMock.mockReturnValue({
      relatedVideos: [],
      video: {
        createdAt: '2026-03-09T00:00:00.000Z',
        duration: 120,
        id: 'video-1',
        tags: ['vault'],
        title: 'Player Fixture',
        videoUrl: '/videos/video-1/manifest.mpd',
      },
    });
    const { default: PlayerRoute } = await importPlayerRoute();

    const markup = renderToString(createElement(
      MemoryRouter,
      { initialEntries: ['/player/video-1'] },
      createElement(PlayerRoute),
    ));

    expect(markup).toContain('Product sidebar');
    expect(markup).toContain('Preparing secure playback');
    expect(markup).toContain('Player Fixture');
    expect(markup).toContain('2:00');
    expect(markup).toContain('3/9/2026');
    expect(markup.match(/<main/g)).toHaveLength(1);
  });

  test('builds player meta for loaded and fallback route states', async () => {
    const { meta } = await importPlayerRoute();

    expect(meta({ data: undefined } as never)).toEqual([
      { title: 'Video Player - Mediavault' },
      { name: 'description', content: 'Local video streaming' },
    ]);
    expect(meta({
      data: {
        video: {
          createdAt: '2026-03-09T00:00:00.000Z',
          duration: 120,
          id: 'video-1',
          tags: ['vault'],
          title: 'Player Fixture',
          videoUrl: '/videos/video-1/manifest.mpd',
        },
      },
    } as never)).toEqual([
      { title: 'Player Fixture - Mediavault' },
      { name: 'description', content: 'Watch Player Fixture on Mediavault' },
    ]);
  });
});
