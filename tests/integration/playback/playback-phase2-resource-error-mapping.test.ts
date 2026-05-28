import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireProtectedMediaSessionMock = vi.fn();
const requireProtectedMediaSessionValueMock = vi.fn();
const fakePlaybackServices = {
  servePlaybackClearKeyLicense: {
    execute: vi.fn(),
  },
  servePlaybackManifest: {
    execute: vi.fn(),
  },
  servePlaybackMediaSegment: {
    execute: vi.fn(),
  },
};

vi.mock('~/composition/server/auth', () => ({
  requireProtectedMediaSession: requireProtectedMediaSessionMock,
  requireProtectedMediaSessionValue: requireProtectedMediaSessionValueMock,
}));

vi.mock('~/composition/server/playback', () => ({
  getServerPlaybackServices: () => fakePlaybackServices,
}));

async function importManifestRoute() {
  return import('../../../app/routes/videos.$videoId.manifest[.]mpd');
}

async function importVideoSegmentRoute() {
  return import('../../../app/routes/videos.$videoId.video.$filename');
}

async function importClearKeyRoute() {
  return import('../../../app/routes/videos.$videoId.clearkey');
}

describe('playback resource route error mapping', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fakePlaybackServices.servePlaybackClearKeyLicense.execute.mockReset();
    fakePlaybackServices.servePlaybackManifest.execute.mockReset();
    fakePlaybackServices.servePlaybackMediaSegment.execute.mockReset();
    requireProtectedMediaSessionMock.mockResolvedValue(null);
    requireProtectedMediaSessionValueMock.mockResolvedValue({
      session: {
        id: 'session-1',
        userId: 'owner-1',
      },
    });
  });

  test('manifest route maps validation errors back to a 400 response', async () => {
    fakePlaybackServices.servePlaybackManifest.execute.mockRejectedValue(
      Object.assign(new Error('Invalid video ID format'), {
        name: 'ValidationError',
        statusCode: 400,
      }),
    );
    const { loader } = await importManifestRoute();

    const response = await loader({
      params: { videoId: '../escape' },
      request: new Request('http://localhost/videos/../escape/manifest.mpd?token=signed-token'),
    } as never);

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.text()).resolves.toBe('Invalid video ID format');
  });

  test('video segment route preserves playback error headers for invalid range responses', async () => {
    fakePlaybackServices.servePlaybackMediaSegment.execute.mockRejectedValue(
      Object.assign(new Error('Range not satisfiable'), {
        headers: {
          'Content-Range': 'bytes */512',
        },
        name: 'ValidationError',
        statusCode: 416,
      }),
    );
    const { loader } = await importVideoSegmentRoute();

    const response = await loader({
      params: { filename: 'segment-9999.m4s', videoId: 'video-1' },
      request: new Request('http://localhost/videos/video-1/video/segment-9999.m4s?token=signed-token', {
        headers: {
          range: 'bytes=999-1200',
        },
      }),
    } as never);

    expect(response.status).toBe(416);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Range')).toBe('bytes */512');
    await expect(response.text()).resolves.toBe('Range not satisfiable');
  });

  test('video segment route maps not-found errors back to a 404 response', async () => {
    fakePlaybackServices.servePlaybackMediaSegment.execute.mockRejectedValue(
      Object.assign(new Error('video segment'), {
        name: 'NotFoundError',
        statusCode: 404,
      }),
    );
    const { loader } = await importVideoSegmentRoute();

    const response = await loader({
      params: { filename: 'segment-9999.m4s', videoId: 'video-1' },
      request: new Request('http://localhost/videos/video-1/video/segment-9999.m4s?token=signed-token'),
    } as never);

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.text()).resolves.toBe('video segment');
  });

  test('clearkey route maps unexpected upstream errors to the current playback unexpected-error contract', async () => {
    fakePlaybackServices.servePlaybackClearKeyLicense.execute.mockRejectedValue(
      new Error('upstream clearkey failure'),
    );
    const { action, loader } = await importClearKeyRoute();

    const loaderResponse = await loader({
      params: { videoId: 'video-1' },
      request: new Request('http://localhost/videos/video-1/clearkey?token=signed-token'),
    } as never);

    const actionResponse = await action({
      params: { videoId: 'video-1' },
      request: new Request('http://localhost/videos/video-1/clearkey?token=signed-token', {
        method: 'POST',
      }),
    } as never);

    expect(loaderResponse.status).toBe(500);
    expect(loaderResponse.headers.get('Cache-Control')).toBe('no-store');
    await expect(loaderResponse.text()).resolves.toBe('Clear Key license access denied');
    expect(actionResponse.status).toBe(500);
    expect(actionResponse.headers.get('Cache-Control')).toBe('no-store');
    await expect(actionResponse.text()).resolves.toBe('Clear Key license access denied');
  });
});
