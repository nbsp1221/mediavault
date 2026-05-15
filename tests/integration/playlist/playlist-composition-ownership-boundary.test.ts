import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createPlaylistRuntimeTestWorkspace, PLAYLIST_OWNER_ID } from '../../support/create-playlist-runtime-test-workspace';

const requireProtectedApiSessionValueMock = vi.fn();

async function importPlaylistDetailApiRoute() {
  return import('../../../app/routes/api.playlists.$id');
}

describe('playlist composition ownership boundary', () => {
  let cleanup: (() => Promise<void>) | undefined;
  let databasePath = '';
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
    databasePath = workspace.databasePath;
    storageDir = workspace.storageDir;
    process.env.DATABASE_SQLITE_PATH = databasePath;
    process.env.STORAGE_DIR = storageDir;

    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('~/composition/server/auth', async () => {
      const actual = await vi.importActual<typeof import('~/composition/server/auth')>('~/composition/server/auth');

      return {
        ...actual,
        requireProtectedApiSessionValue: requireProtectedApiSessionValueMock,
      };
    });
    requireProtectedApiSessionValueMock.mockResolvedValue({ id: 'session-1', userId: PLAYLIST_OWNER_ID });
  });

  afterEach(async () => {
    delete process.env.DATABASE_SQLITE_PATH;
    delete process.env.STORAGE_DIR;
    vi.doUnmock('~/composition/server/auth');
    vi.resetModules();
    if (cleanup) {
      await cleanup();
    }
  });

  test('playlist detail resolves videos from the active metadata store without videos.json bootstrap data', async () => {
    const { loader } = await importPlaylistDetailApiRoute();

    const response = await loader({
      params: { id: 'playlist-owned-private' },
      request: new Request('http://localhost/api/playlists/playlist-owned-private?includeVideos=true&includeStats=true'),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      playlist: expect.objectContaining({
        id: 'playlist-owned-private',
        videos: expect.arrayContaining([
          expect.objectContaining({
            id: 'playlist-video-1',
            title: 'Playlist Fixture One',
          }),
        ]),
      }),
      success: true,
    }));
  });
});
