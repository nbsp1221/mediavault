import type * as ReactRouter from 'react-router';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, RouterContextProvider } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { resolvePublicVideoAccess } from '~/composition/server/auth';
import type { loadPlaylistPlaybackQueue } from '~/composition/server/playlist';
import type { ResolvePlayerVideoUseCase } from '~/modules/playback/application/use-cases/resolve-player-video.usecase';
import type { meta } from '~/routes/player.$id';

const mocks = vi.hoisted(() => ({
  access: vi.fn<typeof resolvePublicVideoAccess>(),
  data: vi.fn<() => unknown>(),
  resolveVideo: vi.fn<ResolvePlayerVideoUseCase['execute']>(),
  queue: vi.fn<typeof loadPlaylistPlaybackQueue>(),
}));
vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof ReactRouter>('react-router')),
  useLoaderData: mocks.data,
}));
vi.mock('~/shared/hooks/use-root-user', () => ({ useRootUser: () => null }));
vi.mock('~/composition/server/auth', () => ({ resolvePublicVideoAccess: mocks.access }));
vi.mock('~/composition/server/playback', () => ({
  getServerPlaybackServices: () => ({ resolvePlayerVideo: { execute: mocks.resolveVideo } }),
}));
vi.mock('~/composition/server/playlist', () => ({ loadPlaylistPlaybackQueue: mocks.queue }));

const video = {
  createdAt: new Date('2026-03-09T00:00:00.000Z'),
  duration: 120,
  id: 'video-1',
  tags: ['vault'],
  title: 'Player Fixture',
  videoUrl: '/videos/video-1/manifest.mpd',
};
const serializedVideo = { ...video, createdAt: video.createdAt.toISOString() };

function args(url = 'http://localhost/player/video-1', id: string | undefined = 'video-1') {
  return {
    context: new RouterContextProvider(),
    params: { id },
    request: new Request(url),
    url: new URL(url),
    pattern: '/player/:id',
  };
}

function metadataArgs(loaderData: unknown): Parameters<typeof meta>[0] {
  return {
    loaderData,
    error: undefined,
    params: { id: 'video-1' },
    matches: [],
    location: { pathname: '/player/video-1', search: '', hash: '', state: null, key: 'default' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    headers: new Headers({ 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' }),
    viewer: { type: 'authenticated', userId: 'owner-1' },
  });
  mocks.resolveVideo.mockResolvedValue({ ok: true, video, relatedVideos: [] });
  mocks.queue.mockResolvedValue({
    success: false,
    status: 404,
    reason: 'PLAYLIST_NOT_FOUND',
    error: 'Playlist not found',
  });
});

describe('player route', () => {
  test('uses playback composition, serializes dates, and preserves private/no-referrer response headers', async () => {
    const { loader } = await import('~/routes/player.$id');
    const response = await loader(args());
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Vary')).toBe('Cookie');
    expect(mocks.resolveVideo).toHaveBeenCalledWith({
      readScope: { ownerId: 'owner-1', type: 'public_or_owned' },
      videoId: 'video-1',
    });
    await expect(response.json()).resolves.toEqual({
      playlist: null,
      relatedVideos: [],
      video: serializedVideo,
    });
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  test('returns 404 without resolving playlist context when the video is unavailable', async () => {
    mocks.resolveVideo.mockResolvedValue({ ok: false, reason: 'VIDEO_NOT_FOUND' });
    const { loader } = await import('~/routes/player.$id');
    await expect(
      loader(args('http://localhost/player/video-1?playlist=private-queue')),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  test('rejects a missing video id', async () => {
    const { loader } = await import('~/routes/player.$id');
    await expect(loader({ ...args(), params: {} })).rejects.toMatchObject({ status: 400 });
    expect(mocks.resolveVideo).not.toHaveBeenCalled();
  });
  test('uses public-only scope for anonymous reads without redirecting', async () => {
    mocks.access.mockResolvedValue({ headers: new Headers(), viewer: { type: 'anonymous' } });
    const { loader } = await import('~/routes/player.$id');
    expect((await loader(args())).status).toBe(200);
    expect(mocks.resolveVideo).toHaveBeenCalledWith({
      readScope: { type: 'public_only' },
      videoId: 'video-1',
    });
  });
  test('includes the full accessible ordered playlist queue only when it contains this video', async () => {
    const queue = {
      id: 'queue-1',
      name: 'Public queue',
      videoIds: ['video-1', ...Array.from({ length: 125 }, (_, index) => `next-${index}`)],
    };
    mocks.queue.mockResolvedValue({ success: true, data: queue });
    const { loader } = await import('~/routes/player.$id');
    const response = await loader(args('http://localhost/player/video-1?playlist=queue-1'));
    await expect(response.json()).resolves.toMatchObject({ playlist: queue });
    expect(mocks.queue).toHaveBeenCalledWith({
      playlistId: 'queue-1',
      viewer: { type: 'authenticated', userId: 'owner-1' },
    });
  });
  test('does not leak an inaccessible playlist through an otherwise public video', async () => {
    const { loader } = await import('~/routes/player.$id');
    const response = await loader(args('http://localhost/player/video-1?playlist=private-queue'));
    await expect(response.json()).resolves.toMatchObject({ playlist: null });
  });
  test('discards a queue that does not contain the current video', async () => {
    mocks.queue.mockResolvedValue({
      success: true,
      data: { id: 'queue-1', name: 'Other queue', videoIds: ['other-video'] },
    });
    const { loader } = await import('~/routes/player.$id');
    await expect(
      (await loader(args('http://localhost/player/video-1?playlist=queue-1'))).json(),
    ).resolves.toMatchObject({ playlist: null });
  });
  test('renders validated serialized loader data inside the product shell', async () => {
    mocks.data.mockReturnValue({ playlist: null, relatedVideos: [], video: serializedVideo });
    const { default: PlayerRoute } = await import('~/routes/player.$id');
    const markup = renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: ['/player/video-1'] },
        createElement(PlayerRoute),
      ),
    );
    expect(markup).toContain('Product sidebar');
    expect(markup).toContain('Preparing secure playback');
    expect(markup).toContain('Player Fixture');
    expect(markup).toContain('2:00');
    expect(markup.match(/<main/g)).toHaveLength(1);
  });
  test('uses React Router 8 loaderData for metadata and a safe fallback for missing data', async () => {
    const { meta: buildMeta } = await import('~/routes/player.$id');
    expect(buildMeta(metadataArgs(undefined))).toEqual([
      { title: 'Video Player - Mediavault' },
      { name: 'description', content: 'Local video streaming' },
    ]);
    expect(buildMeta(metadataArgs({ video: serializedVideo }))).toEqual([
      { title: 'Player Fixture - Mediavault' },
      { name: 'description', content: 'Watch Player Fixture on Mediavault' },
    ]);
  });
});
