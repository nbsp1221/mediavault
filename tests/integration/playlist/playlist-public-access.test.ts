import { afterEach, describe, expect, test, vi } from 'vitest';
import { createInitializedPrimarySqliteDatabase } from '../../../app/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import { routeArgs } from '../../helpers/route-args';
import {
  PLAYLIST_OWNER_ID,
  createPlaylistRuntimeTestWorkspace,
} from '../../support/create-playlist-runtime-test-workspace';

function fixture() {
  return createPlaylistRuntimeTestWorkspace({
    playlists: [
      {
        id: 'public-list',
        name: 'Public collection',
        ownerId: PLAYLIST_OWNER_ID,
        type: 'user_created',
        isPublic: true,
        videoIds: ['public-video', 'owner-private', 'other-private', 'not-ready'],
      },
      {
        id: 'private-list',
        name: 'Private collection',
        ownerId: PLAYLIST_OWNER_ID,
        type: 'user_created',
        isPublic: false,
        videoIds: ['public-video'],
      },
    ],
    videos: [
      {
        id: 'public-video',
        title: 'Public title',
        ownerId: PLAYLIST_OWNER_ID,
        visibility: 'public',
        duration: 60,
        videoUrl: '/videos/public-video/manifest.mpd',
      },
      {
        id: 'owner-private',
        title: 'Owner private title',
        ownerId: PLAYLIST_OWNER_ID,
        visibility: 'private',
        duration: 70,
        videoUrl: '/videos/owner-private/manifest.mpd',
      },
      {
        id: 'other-private',
        title: 'Other private title',
        ownerId: 'other-user',
        visibility: 'private',
        duration: 80,
        videoUrl: '/videos/other-private/manifest.mpd',
      },
      {
        id: 'not-ready',
        title: 'Not ready title',
        ownerId: PLAYLIST_OWNER_ID,
        visibility: 'public',
        duration: 90,
        videoUrl: '/videos/not-ready/manifest.mpd',
        mediaStatus: 'none',
      },
    ],
  });
}

describe('Public playlist and independent video access', { concurrent: false }, () => {
  afterEach(() => vi.resetModules());
  test('anonymous page and API reads expose only public ready videos and never private playlist metadata', async () => {
    const workspace = await fixture();
    try {
      const listPage = await import('../../../app/routes/playlists._index');
      const detailPage = await import('../../../app/routes/playlists.$id');
      const detailApi = await import('../../../app/routes/api.playlists.$id');
      const catalog = await listPage.loader(
        routeArgs({
          request: new Request('http://localhost/playlists'),
        }),
      );
      expect(catalog.data.playlists.map((playlist) => playlist.id)).toEqual(['public-list']);
      expect(catalog.data.playlists[0]?.videoIds).toEqual(['public-video']);
      expect(new Headers(catalog.init?.headers).get('Cache-Control')).toContain('no-store');
      const page = await detailPage.loader(
        routeArgs({
          params: { id: 'public-list' },
          request: new Request('http://localhost/playlists/public-list'),
        }),
      );
      expect(page.data.playlist.videoIds).toEqual(['public-video']);
      expect(page.data.permissions).toEqual({
        canEdit: false,
        canDelete: false,
        canAddVideos: false,
      });
      const response = await detailApi.loader(
        routeArgs({
          params: { id: 'public-list' },
          request: new Request('http://localhost/api/playlists/public-list'),
        }),
      );
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get('Vary')).toBe('Cookie');
      expect(body).toContain('Public title');
      expect(body).not.toMatch(
        /Owner private|Other private|Not ready|owner-private|other-private|not-ready/,
      );
      const denied = await detailApi.loader(
        routeArgs({
          params: { id: 'private-list' },
          request: new Request('http://localhost/api/playlists/private-list'),
        }),
      );
      expect(denied.status).toBe(404);
      expect(await denied.text()).not.toContain('Private collection');
      await expect(
        detailPage.loader(
          routeArgs({
            params: { id: 'private-list' },
            request: new Request('http://localhost/playlists/private-list'),
          }),
        ),
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      await workspace.cleanup();
    }
  });
  test('authenticated owners see their private videos but playlist ownership does not reveal another owner’s private videos', async () => {
    const workspace = await fixture();
    try {
      const cookie = await workspace.login();
      const { loader } = await import('../../../app/routes/api.playlists.$id');
      const response = await loader(
        routeArgs({
          params: { id: 'public-list' },
          request: new Request('http://localhost/api/playlists/public-list', {
            headers: { Cookie: cookie },
          }),
        }),
      );
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        playlist: { videoIds: ['public-video', 'owner-private'] },
        videoPagination: { total: 2 },
        permissions: { canEdit: true },
      });
      expect(JSON.stringify(body)).not.toContain('other-private');
      const privatePage = await loader(
        routeArgs({
          params: { id: 'private-list' },
          request: new Request('http://localhost/api/playlists/private-list', {
            headers: { Cookie: cookie },
          }),
        }),
      );
      expect(privatePage.status).toBe(200);
    } finally {
      await workspace.cleanup();
    }
  });
  test('playback queues re-evaluate visibility, preserve order, and do not include inaccessible IDs', async () => {
    const workspace = await fixture();
    try {
      const { loadPlaylistPlaybackQueue } =
        await import('../../../app/composition/server/playlist');
      expect(
        await loadPlaylistPlaybackQueue({
          playlistId: 'public-list',
          viewer: { type: 'anonymous' },
        }),
      ).toEqual({
        success: true,
        data: { id: 'public-list', name: 'Public collection', videoIds: ['public-video'] },
      });
      expect(
        await loadPlaylistPlaybackQueue({
          playlistId: 'private-list',
          viewer: { type: 'anonymous' },
        }),
      ).toMatchObject({ success: false, status: 404 });
      const database = await createInitializedPrimarySqliteDatabase({
        dbPath: workspace.databasePath,
      });
      await database
        .prepare("UPDATE videos SET visibility = 'private' WHERE id = ?")
        .run('public-video');
      expect(
        await loadPlaylistPlaybackQueue({
          playlistId: 'public-list',
          viewer: { type: 'anonymous' },
        }),
      ).toMatchObject({ success: true, data: { videoIds: [] } });
      expect(
        await loadPlaylistPlaybackQueue({
          playlistId: 'public-list',
          viewer: { type: 'authenticated', userId: PLAYLIST_OWNER_ID },
        }),
      ).toMatchObject({ success: true, data: { videoIds: ['public-video', 'owner-private'] } });
    } finally {
      await workspace.cleanup();
    }
  });
  test('page-size limits never truncate the full ordered playback queue', async () => {
    const ids = Array.from({ length: 105 }, (_, index) => `queue-video-${index}`);
    const workspace = await createPlaylistRuntimeTestWorkspace({
      playlists: [
        {
          id: 'long-list',
          name: 'Long collection',
          ownerId: PLAYLIST_OWNER_ID,
          type: 'user_created',
          isPublic: true,
          videoIds: ids,
        },
      ],
      videos: ids.map((id) => ({
        id,
        title: id,
        ownerId: PLAYLIST_OWNER_ID,
        visibility: 'public',
        duration: 1,
        videoUrl: `/videos/${id}/manifest.mpd`,
      })),
    });
    try {
      const { loader } = await import('../../../app/routes/api.playlists.$id');
      const response = await loader(
        routeArgs({
          params: { id: 'long-list' },
          request: new Request(
            'http://localhost/api/playlists/long-list?videoLimit=25&videoOffset=25',
          ),
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        playlist: {
          videoIds: ids,
          videos: ids.slice(25, 50).map((id) => ({ id })),
        },
        videoPagination: { total: 105, hasMore: true, offset: 25, limit: 25 },
      });
      const { loadPlaylistPlaybackQueue } =
        await import('../../../app/composition/server/playlist');
      expect(
        await loadPlaylistPlaybackQueue({ playlistId: 'long-list', viewer: { type: 'anonymous' } }),
      ).toMatchObject({ success: true, data: { videoIds: ids } });
    } finally {
      await workspace.cleanup();
    }
  });
  test('removing membership and deleting a collection never delete library videos or another collection', async () => {
    const workspace = await fixture();
    try {
      const cookie = await workspace.login();
      const headers = { Cookie: cookie, Origin: 'http://localhost' };
      const database = await createInitializedPrimarySqliteDatabase({
        dbPath: workspace.databasePath,
      });
      const beforeCount = (
        await database.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM videos').get()
      )?.count;
      expect(beforeCount).toBeGreaterThanOrEqual(4);
      const item = await import('../../../app/routes/api.playlists.$id.items.$videoId');
      const detail = await import('../../../app/routes/api.playlists.$id');
      const removed = await item.action(
        routeArgs({
          params: { id: 'public-list', videoId: 'public-video' },
          request: new Request('http://localhost/api/playlists/public-list/items/public-video', {
            method: 'DELETE',
            headers,
          }),
        }),
      );
      expect(removed.status).toBe(200);
      const deleted = await detail.action(
        routeArgs({
          params: { id: 'public-list' },
          request: new Request('http://localhost/api/playlists/public-list', {
            method: 'DELETE',
            headers,
          }),
        }),
      );
      expect(deleted.status).toBe(200);
      expect(await deleted.json()).toEqual({
        success: true,
        deletedPlaylistName: 'Public collection',
        message: 'Playlist "Public collection" deleted successfully',
      });
      expect(
        (await database.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM videos').get())
          ?.count,
      ).toBe(beforeCount);
      const other = await detail.loader(
        routeArgs({
          params: { id: 'private-list' },
          request: new Request('http://localhost/api/playlists/private-list', {
            headers: { Cookie: cookie },
          }),
        }),
      );
      expect(other.status).toBe(200);
      expect(await other.json()).toMatchObject({ playlist: { videoIds: ['public-video'] } });
    } finally {
      await workspace.cleanup();
    }
  });

  test('cookie-authenticated cross-origin commands are rejected before storage changes', async () => {
    const workspace = await fixture();
    try {
      const cookie = await workspace.login();
      const { action, loader } = await import('../../../app/routes/api.playlists.$id');
      const response = await action(
        routeArgs({
          params: { id: 'public-list' },
          request: new Request('http://localhost/api/playlists/public-list', {
            method: 'PUT',
            headers: {
              'Cookie': cookie,
              'Origin': 'https://attacker.invalid',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: 'Changed' }),
          }),
        }),
      );
      expect(response.status).toBe(403);
      const read = await loader(
        routeArgs({
          params: { id: 'public-list' },
          request: new Request('http://localhost/api/playlists/public-list'),
        }),
      );
      expect(await read.json()).toMatchObject({ playlist: { name: 'Public collection' } });
    } finally {
      await workspace.cleanup();
    }
  });
});
