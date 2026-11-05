import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { routeArgs } from '../../helpers/route-args';

const requireSession = vi.fn();
const resolveViewer = vi.fn();
const services = {
  addVideoToPlaylist: { execute: vi.fn() },
  createPlaylist: { execute: vi.fn() },
  deletePlaylist: { execute: vi.fn() },
  findPlaylists: { execute: vi.fn() },
  getPlaylistDetails: { execute: vi.fn() },
  removeVideoFromPlaylist: { execute: vi.fn() },
  reorderPlaylistItems: { execute: vi.fn() },
  updatePlaylist: { execute: vi.fn() },
};

const headers = () => new Headers({ 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' });

describe('Playlist HTTP validation and authorization adapters', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('~/composition/server/auth', () => ({
      requireProtectedApiSessionValue: requireSession,
      resolvePublicVideoAccess: resolveViewer,
    }));
    vi.doMock('~/composition/server/playlist', () => ({
      getServerPlaylistServices: () => services,
    }));
    requireSession.mockResolvedValue({ userId: 'owner-1', id: 'session-1' });
    resolveViewer.mockResolvedValue({
      headers: headers(),
      viewer: { type: 'authenticated', userId: 'owner-1' },
    });
  });
  afterEach(() => {
    vi.doUnmock('~/composition/server/auth');
    vi.doUnmock('~/composition/server/playlist');
    vi.resetModules();
  });

  test('public list forwards validated functional filters, paging and sort values and is non-cacheable', async () => {
    services.findPlaylists.execute.mockResolvedValue({
      success: true,
      data: { playlists: [], hasMore: false, totalCount: 0 },
    });
    const { loader } = await import('../../../app/routes/api.playlists');
    const response = await loader(
      routeArgs({
        request: new Request(
          'http://localhost/api/playlists?q=vault&type=series&status=completed&isPublic=false&genre=action&genre=drama&includeEmpty=false&limit=10&offset=20&sortBy=videoCount&sortOrder=asc',
        ),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Vary')).toBe('Cookie');
    expect(services.findPlaylists.execute.mock.calls[0]?.[0]).toMatchObject({
      ownerId: 'owner-1',
      filters: {
        genre: ['action', 'drama'],
        isPublic: false,
        searchQuery: 'vault',
        status: 'completed',
        type: 'series',
      },
      includeEmpty: false,
      limit: 10,
      offset: 20,
      sortBy: 'videoCount',
      sortOrder: 'asc',
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      playlists: [],
      hasMore: false,
      totalCount: 0,
    });
  });
  test('anonymous reads use an anonymous subject but owner-only choices require login', async () => {
    resolveViewer.mockResolvedValue({ headers: headers(), viewer: { type: 'anonymous' } });
    services.findPlaylists.execute.mockResolvedValue({ success: true, data: { playlists: [] } });
    const { loader } = await import('../../../app/routes/api.playlists');
    expect(
      (await loader(routeArgs({ request: new Request('http://localhost/api/playlists') }))).status,
    ).toBe(200);
    expect(services.findPlaylists.execute).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: undefined }),
    );
    services.findPlaylists.execute.mockClear();
    expect(
      (await loader(routeArgs({ request: new Request('http://localhost/api/playlists?owner=me') })))
        .status,
    ).toBe(401);
    expect(services.findPlaylists.execute).not.toHaveBeenCalled();
  });
  test.each([
    'limit=0',
    'offset=-1',
    'limit=1.5',
    'sortBy=popularity',
    'includeStats=true',
    'type=unknown',
  ])('rejects unsupported query %s rather than silently falling back', async (query) => {
    const { loader } = await import('../../../app/routes/api.playlists');
    expect(
      (await loader(routeArgs({ request: new Request(`http://localhost/api/playlists?${query}`) })))
        .status,
    ).toBe(400);
    expect(services.findPlaylists.execute).not.toHaveBeenCalled();
  });
  test('creates using the trusted session identity and a 201 response', async () => {
    services.createPlaylist.execute.mockResolvedValue({
      success: true,
      data: { playlistId: 'created', message: 'Created' },
    });
    const { action } = await import('../../../app/routes/api.playlists');
    const response = await action(
      routeArgs({
        request: new Request('http://localhost/api/playlists', {
          method: 'POST',
          body: JSON.stringify({ name: ' Vault ', isPublic: true }),
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(services.createPlaylist.execute).toHaveBeenCalledWith({
      name: 'Vault',
      isPublic: true,
      type: 'user_created',
      ownerId: 'owner-1',
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      playlistId: 'created',
      message: 'Created',
    });
  });
  test.each([
    null,
    { name: [] },
    { name: 'Vault', ownerId: 'attacker' },
    { name: 'Vault', isPublic: 'yes' },
  ])('rejects malformed or authority-bearing create input %j', async (body) => {
    const { action } = await import('../../../app/routes/api.playlists');
    expect(
      (
        await action(
          routeArgs({
            request: new Request('http://localhost/api/playlists', {
              method: 'POST',
              body: JSON.stringify(body),
            }),
          }),
        )
      ).status,
    ).toBe(400);
    expect(services.createPlaylist.execute).not.toHaveBeenCalled();
  });
  test('detail reads preserve paging and strip internal failure reasons', async () => {
    services.getPlaylistDetails.execute.mockResolvedValue({
      success: false,
      status: 404,
      reason: 'PLAYLIST_NOT_FOUND',
      error: 'Playlist not found',
    });
    const { loader } = await import('../../../app/routes/api.playlists.$id');
    const response = await loader(
      routeArgs({
        params: { id: 'missing' },
        request: new Request('http://localhost/api/playlists/missing?videoOffset=50&videoLimit=25'),
      }),
    );
    expect(services.getPlaylistDetails.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'owner-1',
        playlistId: 'missing',
        videoOffset: 50,
        videoLimit: 25,
      }),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Playlist not found' });
  });
  test('invalid detail paging and missing IDs never invoke the application', async () => {
    const { loader } = await import('../../../app/routes/api.playlists.$id');
    expect(
      (
        await loader(
          routeArgs({
            params: {},
            request: new Request('http://localhost/api/playlists/missing'),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await loader(
          routeArgs({
            params: { id: 'test' },
            request: new Request('http://localhost/api/playlists/test?videoOffset=NaN'),
          }),
        )
      ).status,
    ).toBe(400);
    expect(services.getPlaylistDetails.execute).not.toHaveBeenCalled();
  });
  test('rejects malformed JSON and invalid item/reorder input before application writes', async () => {
    const { action } = await import('../../../app/routes/api.playlists.$id.items');
    for (const [method, body] of [
      ['POST', '{'],
      ['POST', JSON.stringify({ videoId: 42 })],
      ['PUT', JSON.stringify({ newOrder: [] })],
      ['PUT', JSON.stringify({ newOrder: ['video'], preserveMetadata: false })],
    ]) {
      expect(
        (
          await action(
            routeArgs({
              params: { id: 'test' },
              request: new Request('http://localhost/api/playlists/test/items', { method, body }),
            }),
          )
        ).status,
      ).toBe(400);
    }
    expect(services.addVideoToPlaylist.execute).not.toHaveBeenCalled();
    expect(services.reorderPlaylistItems.execute).not.toHaveBeenCalled();
  });
  test('all mutation routes stop on an auth response without invoking application services', async () => {
    requireSession.mockResolvedValue(
      Response.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    );
    const list = await import('../../../app/routes/api.playlists');
    const detail = await import('../../../app/routes/api.playlists.$id');
    const items = await import('../../../app/routes/api.playlists.$id.items');
    const item = await import('../../../app/routes/api.playlists.$id.items.$videoId');
    for (const [action, method] of [
      [list.action, 'POST'],
      [detail.action, 'PUT'],
      [detail.action, 'DELETE'],
      [items.action, 'POST'],
      [items.action, 'PUT'],
      [item.action, 'DELETE'],
    ] as const) {
      const response = await action(
        routeArgs({
          params: { id: 'test', videoId: 'video' },
          request: new Request('http://localhost/api/playlists/test', {
            method,
            body: method === 'DELETE' ? undefined : '{}',
          }),
        }),
      );
      expect(response.status).toBe(401);
    }
    for (const service of Object.values(services)) {
      expect(service.execute).not.toHaveBeenCalled();
    }
  });
  test('maps command failures and rejects unsupported methods', async () => {
    const { action } = await import('../../../app/routes/api.playlists.$id');
    services.updatePlaylist.execute.mockResolvedValue({
      success: false,
      error: 'Denied',
      reason: 'PLAYLIST_PERMISSION_DENIED',
      status: 403,
    });
    const response = await action(
      routeArgs({
        params: { id: 'test' },
        request: new Request('http://localhost/api/playlists/test', {
          method: 'PUT',
          body: JSON.stringify({ name: 'Valid' }),
        }),
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Denied' });
    expect(
      (
        await action(
          routeArgs({
            params: { id: 'test' },
            request: new Request('http://localhost/api/playlists/test', { method: 'PATCH' }),
          }),
        )
      ).status,
    ).toBe(405);
  });
});
