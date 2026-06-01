import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const useLoaderDataMock = vi.fn();
const useRouteErrorMock = vi.fn();
const playlistsPageMock = vi.fn((props: unknown) => (
  <div data-testid="mock-playlists-page">{JSON.stringify(props)}</div>
));
const playlistDetailPageMock = vi.fn((props: unknown) => (
  <div data-testid="mock-playlist-detail-page">{JSON.stringify(props)}</div>
));

function routeErrorResponse(status: number, data?: string) {
  return {
    data,
    isRouteErrorResponse: true,
    status,
  };
}

function expectProductShellErrorFrame(html: string) {
  expect(html).toContain('<header');
  expect(html).toContain('<main');
  expect(html).toContain('Product navigation');
  expect(html).toContain('Mediavault');
  expect(html).toContain('aria-current="page"');
}

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    isRouteErrorResponse: (error: unknown) => Boolean((error as { isRouteErrorResponse?: boolean } | null)?.isRouteErrorResponse),
    useLoaderData: () => useLoaderDataMock(),
    useRouteLoaderData: (routeId: string) => (
      routeId === 'root'
        ? { user: { id: 'owner-1', role: 'user', username: 'owner' } }
        : undefined
    ),
    useRouteError: () => useRouteErrorMock(),
  };
});

vi.mock('~/pages/playlists/ui/PlaylistsPage', () => ({
  PlaylistsPage: (props: unknown) => playlistsPageMock(props),
}));

vi.mock('~/pages/playlist-detail/ui/PlaylistDetailPage', () => ({
  PlaylistDetailPage: (props: unknown) => playlistDetailPageMock(props),
}));

async function importPlaylistsRoute() {
  return import('../../../app/routes/playlists._index');
}

async function importPlaylistDetailRoute() {
  return import('../../../app/routes/playlists.$id');
}

describe('playlist route adapters', () => {
  afterEach(() => {
    useLoaderDataMock.mockReset();
    useRouteErrorMock.mockReset();
    playlistsPageMock.mockClear();
    playlistDetailPageMock.mockClear();
    vi.resetModules();
    vi.doUnmock('~/composition/server/auth');
    vi.doUnmock('~/composition/server/playlist');
  });

  test('playlist index loader delegates auth and playlist composition', async () => {
    const requireProtectedPageSessionMock = vi.fn().mockResolvedValue({ id: 'session-1', userId: 'owner-1' });
    const fakePlaylistServices = {
      getPlaylistDetails: { execute: vi.fn() },
      findPlaylists: {
        execute: vi.fn().mockResolvedValue({
          data: {
            playlists: [{ id: 'playlist-1', name: 'Vault', videoIds: ['video-1'] }],
            totalCount: 1,
          },
          success: true,
        }),
      },
    };

    vi.doMock('~/composition/server/auth', () => ({
      requireProtectedPageSession: requireProtectedPageSessionMock,
    }));
    vi.doMock('~/composition/server/playlist', () => ({
      getServerPlaylistServices: () => fakePlaylistServices,
    }));

    const { loader } = await importPlaylistsRoute();

    const result = await loader({
      request: new Request('http://localhost/playlists?q=vault'),
    } as never);

    expect(requireProtectedPageSessionMock).toHaveBeenCalledWith(expect.any(Request));
    expect(fakePlaylistServices.findPlaylists.execute).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.objectContaining({ searchQuery: 'vault' }),
      ownerId: 'owner-1',
    }));
    expect(result).toEqual({
      playlists: [{ id: 'playlist-1', name: 'Vault', videoIds: ['video-1'] }],
      searchQuery: 'vault',
      total: 1,
      videoCountMap: { 'playlist-1': 1 },
    });
  });

  test('playlist index loader translates playlist service failures into the public list-page error message', async () => {
    const requireProtectedPageSessionMock = vi.fn().mockResolvedValue({ id: 'session-1', userId: 'owner-1' });
    const fakePlaylistServices = {
      getPlaylistDetails: { execute: vi.fn() },
      findPlaylists: {
        execute: vi.fn().mockResolvedValue({
          error: 'Playlist storage is temporarily unavailable',
          reason: 'PLAYLIST_QUERY_UNAVAILABLE',
          status: 503,
          success: false,
        }),
      },
    };

    vi.doMock('~/composition/server/auth', () => ({
      requireProtectedPageSession: requireProtectedPageSessionMock,
    }));
    vi.doMock('~/composition/server/playlist', () => ({
      getServerPlaylistServices: () => fakePlaylistServices,
    }));

    const { loader } = await importPlaylistsRoute();

    await expect(loader({
      request: new Request('http://localhost/playlists?q=vault'),
    } as never)).rejects.toThrow('Failed to load playlists');

    expect(requireProtectedPageSessionMock).toHaveBeenCalledWith(expect.any(Request));
    expect(fakePlaylistServices.findPlaylists.execute).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.objectContaining({ searchQuery: 'vault' }),
      ownerId: 'owner-1',
    }));
  });

  test('playlist routes render active page modules instead of legacy page paths', async () => {
    const [playlistsIndexSource, playlistDetailSource] = await Promise.all([
      readFile(resolve(PROJECT_ROOT, 'app/routes/playlists._index.tsx'), 'utf8'),
      readFile(resolve(PROJECT_ROOT, 'app/routes/playlists.$id.tsx'), 'utf8'),
    ]);

    expect(playlistsIndexSource).toContain('~/pages/playlists/ui/PlaylistsPage');
    expect(playlistsIndexSource).not.toContain('~/legacy/pages/playlists/ui/PlaylistsPage');
    expect(playlistDetailSource).toContain('~/pages/playlist-detail/ui/PlaylistDetailPage');
    expect(playlistDetailSource).not.toContain('~/legacy/pages/playlist-detail/ui/PlaylistDetailPage');
  });

  test('playlist index route forwards loader data into the active page owner', async () => {
    useLoaderDataMock.mockReturnValue({
      playlists: [{ id: 'playlist-1', name: 'Vault', videoIds: ['video-1'] }],
      searchQuery: 'vault',
      total: 1,
      videoCountMap: { 'playlist-1': 1 },
    });

    const routeModule = await importPlaylistsRoute();
    const element = routeModule.default() as {
      props: {
        onSearchChange: (query: string) => void;
        playlists: Array<{ id: string }>;
        searchQuery: string;
        total: number;
        videoCountMap: Record<string, number>;
      };
    };
    const forwardedProps = element.props as {
      onSearchChange: (query: string) => void;
      playlists: Array<{ id: string }>;
      searchQuery: string;
      total: number;
      videoCountMap: Record<string, number>;
    };

    expect(forwardedProps).toEqual(expect.objectContaining({
      playlists: [{ id: 'playlist-1', name: 'Vault', videoIds: ['video-1'] }],
      searchQuery: 'vault',
      total: 1,
      videoCountMap: { 'playlist-1': 1 },
    }));
    expect(forwardedProps.onSearchChange).toEqual(expect.any(Function));
  });

  test('playlist index route exposes stable meta tags', async () => {
    const { meta } = await importPlaylistsRoute();

    expect(meta({} as never)).toEqual([
      { title: 'Playlists - Mediavault' },
      { name: 'description', content: 'Manage your video playlists' },
    ]);
  });

  test('playlist index error boundary renders route and unexpected failures', async () => {
    const { ErrorBoundary } = await importPlaylistsRoute();

    useRouteErrorMock.mockReturnValue(routeErrorResponse(503, 'Playlist storage unavailable'));
    let html = renderToString(
      <MemoryRouter>
        <ErrorBoundary />
      </MemoryRouter>,
    );

    expect(html).toContain('We couldn’t load your playlists');
    expectProductShellErrorFrame(html);
    expect(html).toContain('Playlist storage unavailable');
    expect(html).toContain('href="/playlists"');
    expect(html).toContain('Try again');
    expect(html).toContain('href="/"');
    expect(html).toContain('Go to home');

    useRouteErrorMock.mockReturnValue(new Error('Database unavailable'));
    html = renderToString(
      <MemoryRouter>
        <ErrorBoundary />
      </MemoryRouter>,
    );

    expect(html).toContain('Something went wrong');
    expectProductShellErrorFrame(html);
    expect(html).toContain('Database unavailable');
    expect(html).toContain('href="/playlists"');
    expect(html).toContain('Try again');
    expect(html).toContain('href="/"');
    expect(html).toContain('Go to home');
  });

  test('playlist detail loader delegates auth and playlist composition', async () => {
    const requireProtectedPageSessionMock = vi.fn().mockResolvedValue({ id: 'session-1', userId: 'owner-1' });
    const fakePlaylistServices = {
      findPlaylists: { execute: vi.fn() },
      getPlaylistDetails: {
        execute: vi.fn().mockResolvedValue({
          data: {
            permissions: { canAddVideos: true, canDelete: true, canEdit: true, canShare: true },
            playlist: {
              createdAt: new Date('2026-03-08T00:00:00.000Z'),
              id: 'playlist-1',
              isPublic: false,
              name: 'Vault',
              ownerId: 'owner-1',
              type: 'user_created',
              updatedAt: new Date('2026-03-08T00:00:00.000Z'),
              videoIds: ['video-1'],
              videos: [{ duration: 90, id: 'video-1', position: 1, title: 'playtime' }],
            },
            relatedPlaylists: [],
            stats: null,
            videoPagination: null,
          },
          success: true,
        }),
      },
    };

    vi.doMock('~/composition/server/auth', () => ({
      requireProtectedPageSession: requireProtectedPageSessionMock,
    }));
    vi.doMock('~/composition/server/playlist', () => ({
      getServerPlaylistServices: () => fakePlaylistServices,
    }));

    const { loader } = await importPlaylistDetailRoute();
    const result = await loader({
      params: { id: 'playlist-1' },
      request: new Request('http://localhost/playlists/playlist-1'),
    } as never);

    expect(requireProtectedPageSessionMock).toHaveBeenCalledWith(expect.any(Request));
    expect(fakePlaylistServices.getPlaylistDetails.execute).toHaveBeenCalledWith({
      includeRelated: false,
      includeStats: true,
      includeVideos: true,
      ownerId: 'owner-1',
      playlistId: 'playlist-1',
      videoLimit: 50,
      videoOffset: 0,
    });
    expect(result).toEqual(expect.objectContaining({
      permissions: expect.objectContaining({
        canAddVideos: true,
        canDelete: true,
        canEdit: true,
        canShare: true,
      }),
      playlist: expect.objectContaining({
        id: 'playlist-1',
        videos: [
          expect.objectContaining({
            id: 'video-1',
            title: 'playtime',
          }),
        ],
      }),
    }));
  });

  test('playlist detail route forwards loader data into the active page owner', async () => {
    useLoaderDataMock.mockReturnValue({
      permissions: { canAddVideos: true, canDelete: true, canEdit: true, canShare: true },
      playlist: {
        id: 'playlist-1',
        name: 'Vault',
        videoIds: ['video-1'],
        videos: [{ id: 'video-1', title: 'playtime' }],
      },
      relatedPlaylists: [],
      stats: { id: 'playlist-1', totalVideos: 1 },
      videoPagination: { hasMore: false, limit: 50, offset: 0, total: 1 },
    });

    const routeModule = await importPlaylistDetailRoute();
    const element = routeModule.default() as {
      props: {
        permissions: { canAddVideos: boolean; canDelete: boolean; canEdit: boolean; canShare: boolean };
        playlist: {
          id: string;
          name: string;
          videoIds: string[];
          videos: Array<{ id: string; title: string }>;
        };
        relatedPlaylists: [];
        stats: { id: string; totalVideos: number };
        videoPagination: { hasMore: boolean; limit: number; offset: number; total: number };
      };
    };

    expect(element.props).toEqual({
      permissions: { canAddVideos: true, canDelete: true, canEdit: true, canShare: true },
      playlist: {
        id: 'playlist-1',
        name: 'Vault',
        videoIds: ['video-1'],
        videos: [{ id: 'video-1', title: 'playtime' }],
      },
      relatedPlaylists: [],
      stats: { id: 'playlist-1', totalVideos: 1 },
      videoPagination: { hasMore: false, limit: 50, offset: 0, total: 1 },
    });
  });

  test('playlist detail route exposes stable meta tags', async () => {
    const { meta } = await importPlaylistDetailRoute();

    expect(meta({} as never)).toEqual([
      { title: 'Playlist Detail - Mediavault' },
      { name: 'description', content: 'View playlist information and videos' },
    ]);
  });

  test('playlist detail error boundary renders private, missing, and unexpected states', async () => {
    const { ErrorBoundary } = await importPlaylistDetailRoute();

    useRouteErrorMock.mockReturnValue(routeErrorResponse(403));
    let html = renderToString(
      <MemoryRouter>
        <ErrorBoundary />
      </MemoryRouter>,
    );

    expect(html).toContain('This playlist is private');
    expectProductShellErrorFrame(html);
    expect(html).toContain('This playlist is not available to your account');
    expect(html).toContain('If you believe you should have access, contact the playlist owner for an invitation.');
    expect(html).toContain('href="/playlists"');
    expect(html).toContain('Back to playlists');
    expect(html).toContain('href="/"');
    expect(html).toContain('Back to library');

    useRouteErrorMock.mockReturnValue(routeErrorResponse(404));
    html = renderToString(
      <MemoryRouter>
        <ErrorBoundary />
      </MemoryRouter>,
    );

    expect(html).toContain('Playlist not found');
    expectProductShellErrorFrame(html);
    expect(html).toContain('The playlist might have been removed or the link could be incorrect. Try a different collection instead.');
    expect(html).toContain('href="/playlists"');
    expect(html).toContain('Browse playlists');
    expect(html).toContain('href="/"');
    expect(html).toContain('Go to library');

    useRouteErrorMock.mockReturnValue(new Error('Playlist service unavailable'));
    html = renderToString(
      <MemoryRouter>
        <ErrorBoundary />
      </MemoryRouter>,
    );

    expect(html).toContain('We couldn’t open this playlist');
    expectProductShellErrorFrame(html);
    expect(html).toContain('Playlist service unavailable');
    expect(html).toContain('href="/playlists"');
    expect(html).toContain('Try again');
    expect(html).toContain('href="/"');
    expect(html).toContain('Go to home');

    useRouteErrorMock.mockReturnValue('unknown failure');
    html = renderToString(
      <MemoryRouter>
        <ErrorBoundary />
      </MemoryRouter>,
    );

    expect(html).toContain('Something unexpected happened while loading the playlist. Please try again shortly.');
  });

  test('playlist detail loader throws 400 when params.id is missing', async () => {
    const requireProtectedPageSessionMock = vi.fn().mockResolvedValue({ id: 'session-1', userId: 'owner-1' });
    const fakePlaylistServices = {
      getPlaylistDetails: { execute: vi.fn() },
    };

    vi.doMock('~/composition/server/auth', () => ({
      requireProtectedPageSession: requireProtectedPageSessionMock,
    }));
    vi.doMock('~/composition/server/playlist', () => ({
      getServerPlaylistServices: () => fakePlaylistServices,
    }));

    const { loader } = await importPlaylistDetailRoute();

    await expect(loader({
      params: {},
      request: new Request('http://localhost/playlists'),
    } as never)).rejects.toMatchObject({
      status: 400,
      statusText: '',
    });

    expect(requireProtectedPageSessionMock).toHaveBeenCalledWith(expect.any(Request));
    expect(fakePlaylistServices.getPlaylistDetails.execute).not.toHaveBeenCalled();
  });
});
