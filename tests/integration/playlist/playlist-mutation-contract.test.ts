import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMigratedPrimarySqliteDatabase } from '../../../app/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { toRequestCookieHeader } from '../../helpers/cookies';
import { seedRuntimeAuthUser } from '../../support/auth-account';
import { createPlaylistRuntimeTestWorkspace } from '../../support/create-playlist-runtime-test-workspace';

async function importPlaylistDetailLoaderRoute() {
  return import('../../../app/routes/api.playlists.$id');
}

async function importPlaylistItemsRoute() {
  return import('../../../app/routes/api.playlists.$id.items');
}

async function importPlaylistItemRoute() {
  return import('../../../app/routes/api.playlists.$id.items.$videoId');
}

async function importPlaylistDetailRoute() {
  return import('../../../app/routes/api.playlists.$id');
}

async function loginWithCredentials(username: string, password: string) {
  const { action } = await import('../../../app/routes/api.auth.login');
  const response = await action({
    request: new Request('http://localhost/api/auth/login', {
      body: JSON.stringify({ password, username }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }),
  } as never);

  return toRequestCookieHeader(response.headers.get('Set-Cookie'));
}

async function readPlaylistRows(databasePath: string) {
  const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });

  return database.prepare<{
    description: string | null;
    id: string;
    name: string;
    owner_id: string;
  }>(`
    SELECT id, name, description, owner_id
    FROM playlists
    ORDER BY id ASC
  `).all();
}

async function readPlaylistItems(databasePath: string, playlistId: string) {
  const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
  const rows = await database.prepare<{
    episode_metadata_json: string | null;
    playlist_id: string;
    position: number;
    video_id: string;
  }>(`
    SELECT playlist_id, video_id, position, episode_metadata_json
    FROM playlist_items
    WHERE playlist_id = ?
    ORDER BY position ASC
  `).all(playlistId);

  return rows.map(row => ({
    episodeMetadata: row.episode_metadata_json
      ? JSON.parse(row.episode_metadata_json) as unknown
      : undefined,
    playlistId: row.playlist_id,
    position: row.position + 1,
    videoId: row.video_id,
  }));
}

describe.sequential('playlist mutation contract', () => {
  afterEach(() => {
    vi.doUnmock('~/composition/server/auth');
    vi.doUnmock('~/composition/server/playlist');
    vi.resetModules();
  });

  test('updates and deletes a playlist with the current response contracts', async () => {
    const workspace = await createPlaylistRuntimeTestWorkspace({
      playlists: [
        {
          createdAt: '2025-10-05T17:17:46.248Z',
          description: 'Owned by the seeded owner',
          id: 'playlist-1',
          isPublic: false,
          name: 'Owned Playlist',
          ownerId: 'seeded-owner-1',
          type: 'user_created',
          updatedAt: '2025-10-05T17:17:46.248Z',
          videoIds: [],
        },
      ],
    });

    try {
      const cookie = await workspace.login();
      const { action } = await importPlaylistDetailRoute();

      const updateResponse = await action({
        params: { id: 'playlist-1' },
        request: new Request('http://localhost/api/playlists/playlist-1', {
          body: JSON.stringify({
            description: 'Updated description',
            name: 'Updated Playlist',
          }),
          headers: new Headers([
            ['Content-Type', 'application/json'],
            ['Cookie', cookie],
          ]),
          method: 'PUT',
        }),
      } as never);

      expect(updateResponse.status).toBe(200);
      await expect(updateResponse.json()).resolves.toEqual(expect.objectContaining({
        playlist: expect.objectContaining({
          description: 'Updated description',
          id: 'playlist-1',
          name: 'Updated Playlist',
        }),
        success: true,
      }));

      const deleteResponse = await action({
        params: { id: 'playlist-1' },
        request: new Request('http://localhost/api/playlists/playlist-1', {
          headers: {
            Cookie: cookie,
          },
          method: 'DELETE',
        }),
      } as never);

      expect(deleteResponse.status).toBe(200);
      await expect(deleteResponse.json()).resolves.toEqual({
        deletedPlaylistName: 'Updated Playlist',
        message: 'Playlist "Updated Playlist" deleted successfully',
        relatedPlaylistsAffected: [],
        success: true,
        videosAffected: 0,
      });
    }
    finally {
      await workspace.cleanup();
    }
  });

  test('rejects non-owner playlist updates with 403 and leaves storage unchanged', async () => {
    const workspace = await createPlaylistRuntimeTestWorkspace({
      playlists: [
        {
          createdAt: '2025-10-05T17:17:46.248Z',
          description: 'Owned by the seeded owner',
          id: 'playlist-1',
          isPublic: false,
          name: 'Owned Playlist',
          ownerId: 'seeded-owner-1',
          type: 'user_created',
          updatedAt: '2025-10-05T17:17:46.248Z',
          videoIds: [],
        },
      ],
    });

    try {
      await seedRuntimeAuthUser(workspace.databasePath, {
        password: 'intruder-password',
        userId: 'intruder-owner',
        username: 'intruder',
      });
      const cookie = await loginWithCredentials('intruder', 'intruder-password');
      const playlistsBefore = await readPlaylistRows(workspace.databasePath);
      vi.resetModules();

      const { action } = await importPlaylistDetailRoute();
      const response = await action({
        params: { id: 'playlist-1' },
        request: new Request('http://localhost/api/playlists/playlist-1', {
          body: JSON.stringify({
            description: 'Should not persist',
            name: 'Hijacked Playlist',
          }),
          headers: new Headers([
            ['Content-Type', 'application/json'],
            ['Cookie', cookie],
          ]),
          method: 'PUT',
        }),
      } as never);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'User "intruder-owner" does not have permission to update playlist "playlist-1"',
      });

      await expect(readPlaylistRows(workspace.databasePath)).resolves.toEqual(playlistsBefore);
    }
    finally {
      await workspace.cleanup();
    }
  });

  test('adds, reorders, and removes playlist items with the current response contracts', async () => {
    const workspace = await createPlaylistRuntimeTestWorkspace({
      playlistItems: [
        {
          addedAt: '2025-10-05T17:17:46.248Z',
          addedBy: 'seeded-owner-1',
          playlistId: 'playlist-1',
          position: 1,
          videoId: '68e5f819-15e8-41ef-90ee-8a96769311b7',
        },
      ],
      playlists: [
        {
          createdAt: '2025-10-05T17:17:46.248Z',
          description: 'Owned by the seeded owner',
          id: 'playlist-1',
          isPublic: false,
          name: 'Owned Playlist',
          ownerId: 'seeded-owner-1',
          type: 'user_created',
          updatedAt: '2025-10-05T17:17:46.248Z',
          videoIds: ['68e5f819-15e8-41ef-90ee-8a96769311b7'],
        },
      ],
      videos: [
        {
          createdAt: '2026-03-08T00:00:00.000Z',
          description: 'Playtime test upload',
          duration: 90,
          id: '68e5f819-15e8-41ef-90ee-8a96769311b7',
          tags: ['Action', 'vault'],
          thumbnailUrl: '/api/thumbnail/68e5f819-15e8-41ef-90ee-8a96769311b7',
          title: 'playtime',
          videoUrl: '/videos/68e5f819-15e8-41ef-90ee-8a96769311b7/manifest.mpd',
        },
        {
          createdAt: '2026-03-09T00:00:00.000Z',
          description: 'Additional related fixture',
          duration: 115,
          id: '01a5c843-7f3e-4af7-9f3d-8cb6a2691d55',
          tags: ['vault'],
          thumbnailUrl: '/api/thumbnail/01a5c843-7f3e-4af7-9f3d-8cb6a2691d55',
          title: 'vault companion',
          videoUrl: '/videos/01a5c843-7f3e-4af7-9f3d-8cb6a2691d55/manifest.mpd',
        },
      ],
    });

    try {
      const cookie = await workspace.login();
      const { action: itemsAction } = await importPlaylistItemsRoute();
      const { action: itemAction } = await importPlaylistItemRoute();
      const { loader: playlistDetailLoader } = await importPlaylistDetailLoaderRoute();

      const addResponse = await itemsAction({
        params: { id: 'playlist-1' },
        request: new Request('http://localhost/api/playlists/playlist-1/items', {
          body: JSON.stringify({
            episodeMetadata: {
              episodeNumber: 2,
              episodeTitle: 'Vault Companion',
            },
            videoId: '01a5c843-7f3e-4af7-9f3d-8cb6a2691d55',
          }),
          headers: new Headers([
            ['Content-Type', 'application/json'],
            ['Cookie', cookie],
          ]),
          method: 'POST',
        }),
      } as never);

      expect(addResponse.status).toBe(200);
      await expect(addResponse.json()).resolves.toEqual(expect.objectContaining({
        finalPosition: 1,
        message: 'Video "vault companion" added to playlist "Owned Playlist" successfully',
        playlistName: 'Owned Playlist',
        success: true,
        totalVideosInPlaylist: 2,
        videoTitle: 'vault companion',
      }));

      const playlistItemsAfterAdd = await readPlaylistItems(workspace.databasePath, 'playlist-1');

      expect(playlistItemsAfterAdd).toEqual([
        expect.objectContaining({
          playlistId: 'playlist-1',
          position: 1,
          videoId: '68e5f819-15e8-41ef-90ee-8a96769311b7',
        }),
        expect.objectContaining({
          episodeMetadata: {
            episodeNumber: 2,
            episodeTitle: 'Vault Companion',
          },
          playlistId: 'playlist-1',
          position: 2,
          videoId: '01a5c843-7f3e-4af7-9f3d-8cb6a2691d55',
        }),
      ]);

      const detailResponse = await playlistDetailLoader({
        params: { id: 'playlist-1' },
        request: new Request('http://localhost/api/playlists/playlist-1?includeVideos=true', {
          headers: {
            Cookie: cookie,
          },
        }),
      } as never);

      expect(detailResponse.status).toBe(200);
      await expect(detailResponse.json()).resolves.toEqual(expect.objectContaining({
        playlist: expect.objectContaining({
          videos: expect.arrayContaining([
            expect.objectContaining({
              episodeMetadata: {
                episodeNumber: 2,
                episodeTitle: 'Vault Companion',
              },
              id: '01a5c843-7f3e-4af7-9f3d-8cb6a2691d55',
            }),
          ]),
        }),
      }));

      const reorderResponse = await itemsAction({
        params: { id: 'playlist-1' },
        request: new Request('http://localhost/api/playlists/playlist-1/items', {
          body: JSON.stringify({
            newOrder: [
              '01a5c843-7f3e-4af7-9f3d-8cb6a2691d55',
              '68e5f819-15e8-41ef-90ee-8a96769311b7',
            ],
          }),
          headers: new Headers([
            ['Content-Type', 'application/json'],
            ['Cookie', cookie],
          ]),
          method: 'PUT',
        }),
      } as never);

      expect(reorderResponse.status).toBe(200);
      await expect(reorderResponse.json()).resolves.toEqual(expect.objectContaining({
        message: 'Playlist "Owned Playlist" reordered successfully',
        newOrder: [
          '01a5c843-7f3e-4af7-9f3d-8cb6a2691d55',
          '68e5f819-15e8-41ef-90ee-8a96769311b7',
        ],
        oldOrder: [
          '68e5f819-15e8-41ef-90ee-8a96769311b7',
          '01a5c843-7f3e-4af7-9f3d-8cb6a2691d55',
        ],
        success: true,
        videosReordered: 2,
      }));

      const playlistItemsAfterReorder = await readPlaylistItems(workspace.databasePath, 'playlist-1');

      expect(playlistItemsAfterReorder).toEqual([
        expect.objectContaining({
          playlistId: 'playlist-1',
          position: 1,
          videoId: '01a5c843-7f3e-4af7-9f3d-8cb6a2691d55',
        }),
        expect.objectContaining({
          playlistId: 'playlist-1',
          position: 2,
          videoId: '68e5f819-15e8-41ef-90ee-8a96769311b7',
        }),
      ]);

      const removeResponse = await itemAction({
        params: {
          id: 'playlist-1',
          videoId: '01a5c843-7f3e-4af7-9f3d-8cb6a2691d55',
        },
        request: new Request('http://localhost/api/playlists/playlist-1/items/01a5c843-7f3e-4af7-9f3d-8cb6a2691d55', {
          headers: {
            Cookie: cookie,
          },
          method: 'DELETE',
        }),
      } as never);

      expect(removeResponse.status).toBe(200);
      await expect(removeResponse.json()).resolves.toEqual(expect.objectContaining({
        message: 'Video removed from playlist "Owned Playlist" successfully',
        playlistId: 'playlist-1',
        remainingVideos: 1,
        success: true,
        videoId: '01a5c843-7f3e-4af7-9f3d-8cb6a2691d55',
      }));

      const playlistItemsAfterRemove = await readPlaylistItems(workspace.databasePath, 'playlist-1');

      expect(playlistItemsAfterRemove).toEqual([
        expect.objectContaining({
          playlistId: 'playlist-1',
          position: 1,
          videoId: '68e5f819-15e8-41ef-90ee-8a96769311b7',
        }),
      ]);
    }
    finally {
      await workspace.cleanup();
    }
  });

  test('rejects invalid reorder payloads with the current 400 response body', async () => {
    const workspace = await createPlaylistRuntimeTestWorkspace({
      playlistItems: [
        {
          addedAt: '2025-10-05T17:17:46.248Z',
          addedBy: 'seeded-owner-1',
          playlistId: 'playlist-1',
          position: 1,
          videoId: 'playlist-video-1',
        },
      ],
      playlists: [
        {
          createdAt: '2025-10-05T17:17:46.248Z',
          description: 'Owned by the seeded owner',
          id: 'playlist-1',
          isPublic: false,
          name: 'Owned Playlist',
          ownerId: 'seeded-owner-1',
          type: 'user_created',
          updatedAt: '2025-10-05T17:17:46.248Z',
          videoIds: ['playlist-video-1'],
        },
      ],
    });

    try {
      const cookie = await workspace.login();
      const { action } = await importPlaylistItemsRoute();

      const response = await action({
        params: { id: 'playlist-1' },
        request: new Request('http://localhost/api/playlists/playlist-1/items', {
          body: JSON.stringify({
            newOrder: [],
          }),
          headers: new Headers([
            ['Content-Type', 'application/json'],
            ['Cookie', cookie],
          ]),
          method: 'PUT',
        }),
      } as never);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'New order cannot be empty',
      });
    }
    finally {
      await workspace.cleanup();
    }
  });

  test('returns 404 when updating a missing playlist', async () => {
    const workspace = await createPlaylistRuntimeTestWorkspace();

    try {
      const cookie = await workspace.login();
      const { action } = await importPlaylistDetailRoute();

      const response = await action({
        params: { id: 'missing-playlist' },
        request: new Request('http://localhost/api/playlists/missing-playlist', {
          body: JSON.stringify({
            name: 'Missing Playlist',
          }),
          headers: new Headers([
            ['Content-Type', 'application/json'],
            ['Cookie', cookie],
          ]),
          method: 'PUT',
        }),
      } as never);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'Playlist with ID "missing-playlist" not found',
      });
    }
    finally {
      await workspace.cleanup();
    }
  });

  test('returns 404 when removing a missing video from an existing playlist', async () => {
    const workspace = await createPlaylistRuntimeTestWorkspace({
      playlistItems: [
        {
          addedAt: '2025-10-05T17:17:46.248Z',
          addedBy: 'seeded-owner-1',
          playlistId: 'playlist-1',
          position: 1,
          videoId: 'playlist-video-1',
        },
      ],
      playlists: [
        {
          createdAt: '2025-10-05T17:17:46.248Z',
          description: 'Owned by the seeded owner',
          id: 'playlist-1',
          isPublic: false,
          name: 'Owned Playlist',
          ownerId: 'seeded-owner-1',
          type: 'user_created',
          updatedAt: '2025-10-05T17:17:46.248Z',
          videoIds: ['playlist-video-1'],
        },
      ],
    });

    try {
      const cookie = await workspace.login();
      const { action } = await importPlaylistItemRoute();

      const response = await action({
        params: {
          id: 'playlist-1',
          videoId: 'missing-video',
        },
        request: new Request('http://localhost/api/playlists/playlist-1/items/missing-video', {
          headers: {
            Cookie: cookie,
          },
          method: 'DELETE',
        }),
      } as never);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'Video "missing-video" not found in playlist "playlist-1"',
      });
    }
    finally {
      await workspace.cleanup();
    }
  });

  test('rejects unsupported methods on playlist item routes with the current 405 body', async () => {
    const workspace = await createPlaylistRuntimeTestWorkspace();

    try {
      const cookie = await workspace.login();
      const { action } = await importPlaylistItemRoute();

      const response = await action({
        params: {
          id: 'playlist-owned-private',
          videoId: 'playlist-video-1',
        },
        request: new Request('http://localhost/api/playlists/playlist-owned-private/items/playlist-video-1', {
          headers: {
            Cookie: cookie,
          },
          method: 'PUT',
        }),
      } as never);

      expect(response.status).toBe(405);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'Method not allowed',
      });
    }
    finally {
      await workspace.cleanup();
    }
  });

  test('playlist items route preserves method-specific 405 bodies', async () => {
    const workspace = await createPlaylistRuntimeTestWorkspace();

    try {
      const cookie = await workspace.login();
      const { action } = await importPlaylistItemsRoute();

      const response = await action({
        params: { id: 'playlist-owned-private' },
        request: new Request('http://localhost/api/playlists/playlist-owned-private/items', {
          headers: {
            Cookie: cookie,
          },
          method: 'DELETE',
        }),
      } as never);

      expect(response.status).toBe(405);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'Method DELETE not allowed',
      });
    }
    finally {
      await workspace.cleanup();
    }
  });
});
