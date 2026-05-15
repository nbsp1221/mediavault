import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const requireProtectedApiSessionValueMock = vi.fn();
const fakePlaylistServices = {
  addVideoToPlaylist: { execute: vi.fn() },
  createPlaylist: { execute: vi.fn() },
  deletePlaylist: { execute: vi.fn() },
  findPlaylists: { execute: vi.fn() },
  getPlaylistDetails: { execute: vi.fn() },
  removeVideoFromPlaylist: { execute: vi.fn() },
  reorderPlaylistItems: { execute: vi.fn() },
  updatePlaylist: { execute: vi.fn() },
};

async function importPlaylistsApiRoute() {
  return import('../../../app/routes/api.playlists');
}

async function importPlaylistDetailApiRoute() {
  return import('../../../app/routes/api.playlists.$id');
}

async function importPlaylistItemsApiRoute() {
  return import('../../../app/routes/api.playlists.$id.items');
}

async function importPlaylistItemApiRoute() {
  return import('../../../app/routes/api.playlists.$id.items.$videoId');
}

describe('playlist api contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('~/composition/server/auth', () => ({
      requireProtectedApiSessionValue: requireProtectedApiSessionValueMock,
    }));
    vi.doMock('~/composition/server/playlist', () => ({
      getServerPlaylistServices: () => fakePlaylistServices,
    }));
    requireProtectedApiSessionValueMock.mockResolvedValue({ id: 'session-1', userId: 'owner-1' });
  });

  afterEach(() => {
    vi.doUnmock('~/composition/server/auth');
    vi.doUnmock('~/composition/server/playlist');
    vi.resetModules();
  });

  test('list route preserves the current success payload shape', async () => {
    fakePlaylistServices.findPlaylists.execute.mockResolvedValue({
      data: {
        filters: { genre: [], searchQuery: 'vault' },
        hasMore: false,
        pagination: { currentPage: 1, limit: 20, offset: 0, totalPages: 1 },
        playlists: [{ id: 'playlist-1', name: 'Vault', ownerId: 'owner-1', type: 'user_created', videoIds: [] }],
        totalCount: 1,
      },
      success: true,
    });
    const { loader } = await importPlaylistsApiRoute();

    const response = await loader({
      request: new Request('http://localhost/api/playlists?q=vault'),
    } as never);

    expect(fakePlaylistServices.findPlaylists.execute).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.objectContaining({ searchQuery: 'vault' }),
      ownerId: 'owner-1',
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      filters: { genre: [], searchQuery: 'vault' },
      hasMore: false,
      pagination: { currentPage: 1, limit: 20, offset: 0, totalPages: 1 },
      playlists: [{ id: 'playlist-1', name: 'Vault', ownerId: 'owner-1', type: 'user_created', videoIds: [] }],
      success: true,
      totalCount: 1,
    });
  });

  test('list route parses optional filters, pagination, and sorting parameters', async () => {
    fakePlaylistServices.findPlaylists.execute.mockResolvedValue({
      data: {
        filters: { genre: ['action', 'drama'], isPublic: false, searchQuery: undefined },
        hasMore: false,
        pagination: { currentPage: 3, limit: 10, offset: 20, totalPages: 3 },
        playlists: [],
        totalCount: 0,
      },
      success: true,
    });
    const { loader } = await importPlaylistsApiRoute();

    const response = await loader({
      request: new Request([
        'http://localhost/api/playlists?',
        'type=series',
        '&status=completed',
        '&isPublic=false',
        '&genre=action',
        '&genre=drama',
        '&seriesName=Vault',
        '&includeEmpty=false',
        '&includeStats=true',
        '&limit=10',
        '&offset=20',
        '&sortBy=name',
        '&sortOrder=asc',
      ].join('')),
    } as never);

    expect(response.status).toBe(200);
    expect(fakePlaylistServices.findPlaylists.execute).toHaveBeenCalledWith(expect.objectContaining({
      filters: {
        genre: ['action', 'drama'],
        isPublic: false,
        searchQuery: undefined,
        seriesName: 'Vault',
        status: 'completed',
        type: 'series',
      },
      includeEmpty: false,
      includeStats: true,
      limit: 10,
      offset: 20,
      ownerId: 'owner-1',
      sortBy: 'name',
      sortOrder: 'asc',
    }));
  });

  test('list route falls back for unsupported filter and sort values', async () => {
    fakePlaylistServices.findPlaylists.execute.mockResolvedValue({
      data: {
        filters: {},
        hasMore: false,
        pagination: { currentPage: 1, limit: 20, offset: 0, totalPages: 1 },
        playlists: [],
        totalCount: 0,
      },
      success: true,
    });
    const { loader } = await importPlaylistsApiRoute();

    const response = await loader({
      request: new Request('http://localhost/api/playlists?type=bad&status=bad&sortBy=bad&sortOrder=bad&isPublic=true'),
    } as never);

    expect(response.status).toBe(200);
    expect(fakePlaylistServices.findPlaylists.execute).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.objectContaining({
        isPublic: true,
        status: undefined,
        type: undefined,
      }),
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    }));
  });

  test('create route preserves the current success payload shape', async () => {
    fakePlaylistServices.createPlaylist.execute.mockResolvedValue({
      data: {
        autoGeneratedThumbnail: false,
        message: 'Playlist "Vault" created successfully',
        playlistId: 'playlist-1',
      },
      success: true,
    });
    const { action } = await importPlaylistsApiRoute();

    const response = await action({
      request: new Request('http://localhost/api/playlists', {
        body: JSON.stringify({
          name: 'Vault',
          type: 'user_created',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    } as never);

    expect(fakePlaylistServices.createPlaylist.execute).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Vault',
      ownerId: 'owner-1',
      type: 'user_created',
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      autoGeneratedThumbnail: false,
      message: 'Playlist "Vault" created successfully',
      playlistId: 'playlist-1',
      success: true,
    });
  });

  test('create route rejects non-POST methods with the current 405 body', async () => {
    const { action } = await importPlaylistsApiRoute();

    const response = await action({
      request: new Request('http://localhost/api/playlists', {
        method: 'GET',
      }),
    } as never);

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Method not allowed',
    });
    expect(fakePlaylistServices.createPlaylist.execute).not.toHaveBeenCalled();
  });

  test('create route serializes service failures into the public error envelope and hides reason', async () => {
    fakePlaylistServices.createPlaylist.execute.mockResolvedValue({
      error: 'Playlist with name "Vault" already exists for user "owner-1"',
      reason: 'DUPLICATE_PLAYLIST_NAME',
      status: 409,
      success: false,
    });
    const { action } = await importPlaylistsApiRoute();

    const response = await action({
      request: new Request('http://localhost/api/playlists', {
        body: JSON.stringify({
          name: 'Vault',
          type: 'user_created',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    } as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Playlist with name "Vault" already exists for user "owner-1"',
    });
  });

  test('list route serializes service failures into the public error envelope and hides reason', async () => {
    fakePlaylistServices.findPlaylists.execute.mockResolvedValue({
      error: 'Playlist catalog unavailable',
      reason: 'PLAYLIST_STORAGE_UNAVAILABLE',
      status: 503,
      success: false,
    });
    const { loader } = await importPlaylistsApiRoute();

    const response = await loader({
      request: new Request('http://localhost/api/playlists'),
    } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Playlist catalog unavailable',
    });
  });

  test('detail loader preserves the current success payload shape', async () => {
    fakePlaylistServices.getPlaylistDetails.execute.mockResolvedValue({
      data: {
        permissions: {
          canAddVideos: true,
          canDelete: true,
          canEdit: true,
          canShare: true,
        },
        playlist: {
          createdAt: new Date('2026-03-08T00:00:00.000Z'),
          id: 'playlist-1',
          isPublic: false,
          name: 'Vault',
          ownerId: 'owner-1',
          stats: {
            completionRate: 0,
            id: 'playlist-1',
            lastUpdated: new Date('2026-03-08T00:00:00.000Z'),
            popularityScore: 1,
            totalDuration: 0,
            totalVideos: 1,
            totalViews: 0,
          },
          type: 'user_created',
          updatedAt: new Date('2026-03-08T00:00:00.000Z'),
          videoIds: ['video-1'],
          videos: [{
            duration: 90,
            id: 'video-1',
            position: 1,
            title: 'playtime',
          }],
        },
        relatedPlaylists: [],
        stats: {
          completionRate: 0,
          id: 'playlist-1',
          lastUpdated: new Date('2026-03-08T00:00:00.000Z'),
          popularityScore: 1,
          totalDuration: 0,
          totalVideos: 1,
          totalViews: 0,
        },
        videoPagination: {
          hasMore: false,
          limit: 50,
          offset: 0,
          total: 1,
        },
      },
      success: true,
    });
    const { loader } = await importPlaylistDetailApiRoute();

    const response = await loader({
      params: { id: 'playlist-1' },
      request: new Request('http://localhost/api/playlists/playlist-1?includeVideos=true&includeStats=true'),
    } as never);

    expect(fakePlaylistServices.getPlaylistDetails.execute).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'owner-1',
      playlistId: 'playlist-1',
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      permissions: expect.objectContaining({ canEdit: true }),
      playlist: expect.objectContaining({
        id: 'playlist-1',
        name: 'Vault',
        videos: [expect.objectContaining({ id: 'video-1', title: 'playtime' })],
      }),
      success: true,
      videoPagination: expect.objectContaining({ total: 1 }),
    }));
  });

  test('detail loader returns 400 when params.id is missing without calling playlist services', async () => {
    const { loader } = await importPlaylistDetailApiRoute();

    const response = await loader({
      params: {},
      request: new Request('http://localhost/api/playlists'),
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Playlist ID is required',
    });
    expect(fakePlaylistServices.getPlaylistDetails.execute).not.toHaveBeenCalled();
  });

  test('detail loader serializes service failures into the public error envelope and hides reason', async () => {
    fakePlaylistServices.getPlaylistDetails.execute.mockResolvedValue({
      error: 'Playlist not found',
      reason: 'PLAYLIST_NOT_FOUND',
      status: 404,
      success: false,
    });
    const { loader } = await importPlaylistDetailApiRoute();

    const response = await loader({
      params: { id: 'missing-playlist' },
      request: new Request('http://localhost/api/playlists/missing-playlist'),
    } as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Playlist not found',
    });
  });

  test('playlist detail mutation route preserves method-specific 405 bodies', async () => {
    const { action } = await importPlaylistDetailApiRoute();

    const response = await action({
      params: { id: 'playlist-1' },
      request: new Request('http://localhost/api/playlists/playlist-1', {
        method: 'PATCH',
      }),
    } as never);

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Method PATCH not allowed',
    });
    expect(fakePlaylistServices.updatePlaylist.execute).not.toHaveBeenCalled();
    expect(fakePlaylistServices.deletePlaylist.execute).not.toHaveBeenCalled();
  });

  test('playlist detail update route serializes service failures into the public error envelope and hides reason', async () => {
    fakePlaylistServices.updatePlaylist.execute.mockResolvedValue({
      error: 'Playlist with ID "missing-playlist" not found',
      reason: 'PLAYLIST_NOT_FOUND',
      status: 404,
      success: false,
    });
    const { action } = await importPlaylistDetailApiRoute();

    const response = await action({
      params: { id: 'missing-playlist' },
      request: new Request('http://localhost/api/playlists/missing-playlist', {
        body: JSON.stringify({ name: 'Vault' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      }),
    } as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Playlist with ID "missing-playlist" not found',
    });
  });

  test('playlist detail delete route serializes service failures into the public error envelope and hides reason', async () => {
    fakePlaylistServices.deletePlaylist.execute.mockResolvedValue({
      error: 'User "owner-2" does not have permission to delete playlist "playlist-1"',
      reason: 'PLAYLIST_PERMISSION_DENIED',
      status: 403,
      success: false,
    });
    const { action } = await importPlaylistDetailApiRoute();

    const response = await action({
      params: { id: 'playlist-1' },
      request: new Request('http://localhost/api/playlists/playlist-1', {
        method: 'DELETE',
      }),
    } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'User "owner-2" does not have permission to delete playlist "playlist-1"',
    });
  });

  test('playlist items add route serializes service failures into the public error envelope and hides reason', async () => {
    fakePlaylistServices.addVideoToPlaylist.execute.mockResolvedValue({
      error: 'Video with ID "missing-video" not found',
      reason: 'VIDEO_NOT_FOUND',
      status: 400,
      success: false,
    });
    const { action } = await importPlaylistItemsApiRoute();

    const response = await action({
      params: { id: 'playlist-1' },
      request: new Request('http://localhost/api/playlists/playlist-1/items', {
        body: JSON.stringify({ videoId: 'missing-video' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Video with ID "missing-video" not found',
    });
  });

  test('playlist items reorder route serializes service failures into the public error envelope and hides reason', async () => {
    fakePlaylistServices.reorderPlaylistItems.execute.mockResolvedValue({
      error: 'New order must contain exactly the same videos as current playlist',
      reason: 'PLAYLIST_REORDER_ERROR',
      status: 400,
      success: false,
    });
    const { action } = await importPlaylistItemsApiRoute();

    const response = await action({
      params: { id: 'playlist-1' },
      request: new Request('http://localhost/api/playlists/playlist-1/items', {
        body: JSON.stringify({ newOrder: ['video-2'] }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      }),
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'New order must contain exactly the same videos as current playlist',
    });
  });

  test('playlist item remove route serializes service failures into the public error envelope and hides reason', async () => {
    fakePlaylistServices.removeVideoFromPlaylist.execute.mockResolvedValue({
      error: 'Video "missing-video" not found in playlist "playlist-1"',
      reason: 'VIDEO_NOT_FOUND_IN_PLAYLIST',
      status: 404,
      success: false,
    });
    const { action } = await importPlaylistItemApiRoute();

    const response = await action({
      params: { id: 'playlist-1', videoId: 'missing-video' },
      request: new Request('http://localhost/api/playlists/playlist-1/items/missing-video', {
        method: 'DELETE',
      }),
    } as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Video "missing-video" not found in playlist "playlist-1"',
    });
  });

  test('route returns auth response without touching services when unauthorized', async () => {
    requireProtectedApiSessionValueMock.mockResolvedValue(new Response('unauthorized', { status: 401 }));
    const { loader } = await importPlaylistsApiRoute();

    const response = await loader({
      request: new Request('http://localhost/api/playlists'),
    } as never);

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('unauthorized');
    expect(fakePlaylistServices.findPlaylists.execute).not.toHaveBeenCalled();
  });
});
