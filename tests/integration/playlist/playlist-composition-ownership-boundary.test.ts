import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as AuthSessionHttp from '~/routes/.server/auth-session-http';
import { routeArgs } from '../../helpers/route-args';
import {
  PLAYLIST_OWNER_ID,
  createPlaylistRuntimeTestWorkspace,
} from '../../support/create-playlist-runtime-test-workspace';

const requireProtectedApiSessionValueMock = vi.fn();

async function importPlaylistDetailApiRoute() {
  return import('../../../app/routes/api.playlists.$id');
}

describe('playlist composition ownership boundary', () => {
  let cleanup: (() => Promise<void>) | undefined;
  let storageDir = '';

  beforeEach(async () => {
    const workspace = await createPlaylistRuntimeTestWorkspace({
      playlists: [
        {
          createdAt: '2026-03-08T00:00:00.000Z',
          description: 'Owned playlist fixture',
          id: 'playlist-owned-private',
          isPublic: false,
          name: 'Owned Private Playlist',
          ownerId: PLAYLIST_OWNER_ID,
          type: 'user_created',
          updatedAt: '2026-03-08T00:00:00.000Z',
          videoIds: ['playlist-video-1'],
        },
      ],
      videos: [
        {
          createdAt: '2026-03-08T00:00:00.000Z',
          description: 'Playlist fixture video',
          duration: 101,
          id: 'playlist-video-1',
          tags: ['playlist'],
          thumbnailUrl: '/api/thumbnail/playlist-video-1',
          title: 'Playlist Fixture One',
          videoUrl: '/videos/playlist-video-1/manifest.mpd',
        },
      ],
    });
    cleanup = workspace.cleanup;
    storageDir = workspace.storageDir;
    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;

    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('~/routes/.server/auth-session-http', async () => {
      const actual = await vi.importActual<typeof AuthSessionHttp>(
        '~/routes/.server/auth-session-http',
      );

      return {
        ...actual,
        requireProtectedApiSessionValue: requireProtectedApiSessionValueMock,
        resolvePublicVideoAccess: async () => ({
          headers: new Headers({ 'Cache-Control': 'private, no-store' }),
          viewer: { type: 'authenticated', userId: PLAYLIST_OWNER_ID },
        }),
      };
    });
    requireProtectedApiSessionValueMock.mockResolvedValue({
      id: 'session-1',
      userId: PLAYLIST_OWNER_ID,
    });
  });

  afterEach(async () => {
    delete process.env.MEDIAVAULT_STORAGE_DIR;
    vi.doUnmock('~/routes/.server/auth-session-http');
    vi.resetModules();
    if (cleanup) {
      await cleanup();
    }
  });

  test('playlist detail resolves ready videos from canonical metadata', async () => {
    const { loader } = await importPlaylistDetailApiRoute();

    const response = await loader(
      routeArgs({
        params: { id: 'playlist-owned-private' },
        request: new Request(
          'http://localhost/api/playlists/playlist-owned-private?includeVideos=true',
        ),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      playlist: {
        id: 'playlist-owned-private',
        videos: [
          {
            id: 'playlist-video-1',
            title: 'Playlist Fixture One',
          },
        ],
      },
      success: true,
    });
  });
});
