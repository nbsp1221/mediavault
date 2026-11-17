import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { routeArgs } from '../../helpers/route-args';

const access = vi.fn();
const find = vi.fn();
const details = vi.fn();

describe('Public playlist page adapters', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    access.mockResolvedValue({
      viewer: { type: 'anonymous' },
      headers: new Headers({ 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' }),
    });
    vi.doMock('~/routes/.server/auth-session-http', () => ({ resolvePublicVideoAccess: access }));
    vi.doMock('~/composition/server/playlist.server', () => ({
      getServerPlaylistServices: () => ({
        findPlaylists: { execute: find },
        getPlaylistDetails: { execute: details },
      }),
    }));
  });
  afterEach(() => {
    vi.doUnmock('~/routes/.server/auth-session-http');
    vi.doUnmock('~/composition/server/playlist.server');
    vi.resetModules();
  });
  test('list adapter resolves an optional viewer and preserves URL search and pagination state', async () => {
    find.mockResolvedValue({
      ok: true,
      data: { playlists: [], totalCount: 42, hasMore: true },
    });
    const { loader } = await import('../../../app/routes/playlists._index');
    const result = await loader(
      routeArgs({ request: new Request('http://localhost/playlists?q=vault') }),
    );
    expect(access).toHaveBeenCalledWith(expect.any(Request));
    expect(find.mock.calls[0]?.[0]).toMatchObject({
      ownerId: undefined,
      filters: { searchQuery: 'vault' },
      limit: 20,
      offset: 0,
    });
    expect(result.data).toEqual({ playlists: [], total: 42, hasMore: true, searchQuery: 'vault' });
    expect(new Headers(result.init?.headers).get('Cache-Control')).toContain('no-store');
    expect(new Headers(result.init?.headers).get('Vary')).toBe('Cookie');
  });
  test('list failures become non-cacheable responses without exposing internal details', async () => {
    find.mockResolvedValue({
      ok: false,
      message: 'Sensitive database location',
      reason: 'PLAYLIST_QUERY_UNAVAILABLE',
    });
    const { loader } = await import('../../../app/routes/playlists._index');
    const failure: unknown = await loader(
      routeArgs({ request: new Request('http://localhost/playlists') }),
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Response);
    if (!(failure instanceof Response)) {
      throw new Error('Expected an HTTP failure');
    }
    expect(failure.status).toBe(503);
    expect(failure.headers.get('Cache-Control')).toContain('no-store');
    expect(await failure.text()).not.toContain('Sensitive database location');
  });
  test('detail adapter passes trusted optional identity to the application and requests related metadata', async () => {
    access.mockResolvedValue({
      viewer: { type: 'authenticated', userId: 'owner-1' },
      headers: new Headers({ 'Cache-Control': 'private, no-store' }),
    });
    details.mockResolvedValue({ ok: true, data: { playlist: { id: 'playlist-1' } } });
    const { loader } = await import('../../../app/routes/playlists.$id');
    const result = await loader(
      routeArgs({
        request: new Request('http://localhost/playlists/playlist-1'),
        params: { id: 'playlist-1' },
      }),
    );
    expect(details).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      playlistId: 'playlist-1',
      includeVideos: true,
      includeRelated: true,
      videoLimit: 50,
      videoOffset: 0,
    });
    expect(result.data).toEqual({ playlist: { id: 'playlist-1' } });
  });
  test('missing IDs fail neutrally without invoking the application', async () => {
    const { loader } = await import('../../../app/routes/playlists.$id');
    await expect(
      loader(routeArgs({ request: new Request('http://localhost/playlists'), params: {} })),
    ).rejects.toMatchObject({ status: 404 });
    expect(details).not.toHaveBeenCalled();
  });
  test('missing and inaccessible playlists use the same neutral HTTP result', async () => {
    details.mockResolvedValue({
      ok: false,
      message: 'Private collection identity',
      reason: 'PLAYLIST_NOT_FOUND',
    });
    const { loader } = await import('../../../app/routes/playlists.$id');
    const failure: unknown = await loader(
      routeArgs({
        request: new Request('http://localhost/playlists/private'),
        params: { id: 'private' },
      }),
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Response);
    if (!(failure instanceof Response)) {
      throw new Error('Expected an HTTP failure');
    }
    expect(failure.status).toBe(404);
    expect(await failure.text()).toBe('Playlist not found');
  });
});
