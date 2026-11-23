import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, RouterContextProvider } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { loadPlaylistPlaybackQueue } from '~/composition/server/playlist.server';
import type { ResolvePlayerVideoUseCase } from '~/modules/playback/application/use-cases/resolve-player-video.usecase';
import type { resolvePublicVideoAccess } from '~/routes/.server/auth-session-http';
import type { meta } from '~/routes/player.$id';

const mocks = vi.hoisted(() => ({
  access: vi.fn<typeof resolvePublicVideoAccess>(),
  resolveVideo: vi.fn<ResolvePlayerVideoUseCase['execute']>(),
  queue: vi.fn<typeof loadPlaylistPlaybackQueue>(),
}));
vi.mock('~/shared/hooks/use-root-user', () => ({ useRootUser: () => null }));
vi.mock('~/routes/.server/auth-session-http', () => ({ resolvePublicVideoAccess: mocks.access }));
vi.mock('~/composition/server/playback.server', () => ({
  getServerPlaybackServices: () => ({ resolvePlayerVideo: { execute: mocks.resolveVideo } }),
}));
vi.mock('~/composition/server/playlist.server', () => ({ loadPlaylistPlaybackQueue: mocks.queue }));

const video = {
  createdAt: new Date('2026-03-09T00:00:00.000Z'),
  duration: 120,
  id: 'video-1',
  tags: ['vault'],
  title: 'Player Fixture',
  videoUrl: '/videos/video-1/manifest.mpd',
};
const playerData = { playlist: null, relatedVideos: [], video };

function args(url = 'http://localhost/player/video-1', id = 'video-1') {
  return {
    context: new RouterContextProvider(),
    params: { id },
    request: new Request(url),
    url: new URL(url),
    pattern: '/player/:id',
  };
}

function metadataArgs(
  loaderData: Parameters<typeof meta>[0]['loaderData'],
): Parameters<typeof meta>[0] {
  return {
    loaderData,
    error: undefined,
    params: { id: 'video-1' },
    matches: [
      { id: 'root', pathname: '/', params: {}, meta: [], loaderData: { user: null } },
      {
        id: 'routes/player.$id',
        pathname: '/player/video-1',
        params: { id: 'video-1' },
        meta: [],
        loaderData: playerData,
      },
    ],
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
    ok: false,
    reason: 'PLAYLIST_NOT_FOUND',
    message: 'Playlist not found',
  });
});

describe('player route', () => {
  test('uses playback composition, sends native dates, and preserves private/no-referrer response headers', async () => {
    const { loader } = await import('~/routes/player.$id');
    const response = await loader(args());
    expect(new Headers(response.init?.headers).get('Cache-Control')).toBe('private, no-store');
    expect(new Headers(response.init?.headers).get('Referrer-Policy')).toBe('no-referrer');
    expect(new Headers(response.init?.headers).get('Vary')).toBe('Cookie');
    expect(mocks.resolveVideo).toHaveBeenCalledWith({
      readScope: { ownerId: 'owner-1', type: 'public_or_owned' },
      videoId: 'video-1',
    });
    expect(response.data).toEqual({
      playlist: null,
      relatedVideos: [],
      video,
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
    await expect(loader(args('http://localhost/player/', ''))).rejects.toMatchObject({
      status: 400,
    });
    expect(mocks.resolveVideo).not.toHaveBeenCalled();
  });
  test('uses public-only scope for anonymous reads without redirecting', async () => {
    mocks.access.mockResolvedValue({ headers: new Headers(), viewer: { type: 'anonymous' } });
    const { loader } = await import('~/routes/player.$id');
    expect((await loader(args())).init?.status ?? 200).toBe(200);
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
    mocks.queue.mockResolvedValue({ ok: true, data: queue });
    const { loader } = await import('~/routes/player.$id');
    const response = await loader(args('http://localhost/player/video-1?playlist=queue-1'));
    expect(response.data).toMatchObject({ playlist: queue });
    expect(mocks.queue).toHaveBeenCalledWith({
      playlistId: 'queue-1',
      viewer: { type: 'authenticated', userId: 'owner-1' },
    });
  });
  test('does not leak an inaccessible playlist through an otherwise public video', async () => {
    const { loader } = await import('~/routes/player.$id');
    const response = await loader(args('http://localhost/player/video-1?playlist=private-queue'));
    expect(response.data).toMatchObject({ playlist: null });
  });
  test('discards a queue that does not contain the current video', async () => {
    mocks.queue.mockResolvedValue({
      ok: true,
      data: { id: 'queue-1', name: 'Other queue', videoIds: ['other-video'] },
    });
    const { loader } = await import('~/routes/player.$id');
    expect(
      (await loader(args('http://localhost/player/video-1?playlist=queue-1'))).data,
    ).toMatchObject({ playlist: null });
  });
  test('renders typed loader data inside the product shell', async () => {
    const { default: PlayerRoute } = await import('~/routes/player.$id');
    const markup = renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: ['/player/video-1'] },
        createElement(PlayerRoute, {
          loaderData: playerData,
          params: { id: video.id },
          matches: [
            {
              id: 'root',
              pathname: '/',
              params: {},
              loaderData: { user: null },
              handle: undefined,
            },
            {
              id: 'routes/player.$id',
              pathname: '/player/video-1',
              params: { id: video.id },
              loaderData: playerData,
              handle: undefined,
            },
          ],
        }),
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
    expect(buildMeta(metadataArgs(playerData))).toEqual([
      { title: 'Player Fixture - Mediavault' },
      { name: 'description', content: 'Watch Player Fixture on Mediavault' },
    ]);
  });
});
