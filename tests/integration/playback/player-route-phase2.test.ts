import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireProtectedPageSessionMock = vi.fn();
const fakePlaybackServices = {
  resolvePlayerVideo: {
    execute: vi.fn(),
  },
};

vi.mock('~/composition/server/auth', () => ({
  requireProtectedPageSession: requireProtectedPageSessionMock,
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
    fakePlaybackServices.resolvePlayerVideo.execute.mockReset();
    requireProtectedPageSessionMock.mockResolvedValue({
      id: 'session-1',
      userId: 'owner-1',
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

    const data = await loader({
      params: { id: 'video-1' },
      request: new Request('http://localhost/player/video-1'),
    } as never);

    expect(fakePlaybackServices.resolvePlayerVideo.execute).toHaveBeenCalledWith({
      readScope: {
        ownerId: 'owner-1',
        type: 'public_or_owned',
      },
      videoId: 'video-1',
    });
    expect(data).toEqual({
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

  test('does not resolve player data when the protected page guard rejects the request', async () => {
    const redirectResponse = new Response(null, {
      headers: {
        Location: '/login?redirectTo=%2Fplayer%2Fvideo-1',
      },
      status: 302,
    });
    requireProtectedPageSessionMock.mockRejectedValue(redirectResponse);
    const { loader } = await importPlayerRoute();

    await expect(loader({
      params: { id: 'video-1' },
      request: new Request('http://localhost/player/video-1'),
    } as never)).rejects.toBe(redirectResponse);

    expect(fakePlaybackServices.resolvePlayerVideo.execute).not.toHaveBeenCalled();
  });
});
