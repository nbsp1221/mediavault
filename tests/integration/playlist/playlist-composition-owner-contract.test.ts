import { describe, expect, test } from 'vitest';
import type { PlaylistResult } from '../../../app/composition/server/playlist';
import type { PlaylistRepositoryPort } from '../../../app/modules/playlist/application/ports/playlist-repository.port';
import type { PlaylistVideoCatalogPort } from '../../../app/modules/playlist/application/ports/playlist-video-catalog.port';
import type { Playlist } from '../../../app/modules/playlist/domain/playlist';
import { createServerPlaylistServices } from '../../../app/composition/server/playlist';

function buildPlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    createdAt: new Date('2026-03-08T00:00:00.000Z'),
    id: 'playlist-1',
    isPublic: false,
    name: 'Owned Playlist',
    ownerId: 'owner-1',
    type: 'user_created',
    updatedAt: new Date('2026-03-08T00:00:00.000Z'),
    videoIds: [],
    ...overrides,
  };
}

function createPlaylistRepository(
  overrides: Partial<PlaylistRepositoryPort> = {},
): PlaylistRepositoryPort {
  return {
    addVideoToPlaylist: async () => {},
    create: async input => buildPlaylist({
      id: 'created-playlist',
      isPublic: input.isPublic,
      metadata: input.metadata,
      name: input.name,
      ownerId: input.ownerId,
      type: input.type,
      videoIds: input.videoIds ?? [],
    }),
    delete: async () => true,
    findById: async () => buildPlaylist(),
    findBySeries: async () => [],
    findWithFilters: async () => [],
    getPlaylistItems: async playlistId => [{
      addedAt: new Date('2026-03-08T00:00:00.000Z'),
      addedBy: 'owner-1',
      playlistId,
      position: 0,
      videoId: 'video-1',
    }],
    nameExistsForOwner: async () => false,
    removeVideoFromPlaylist: async () => {},
    reorderPlaylistItems: async () => {},
    update: async (id, updates) => buildPlaylist({
      id,
      description: updates.description,
      isPublic: updates.isPublic ?? false,
      metadata: updates.metadata,
      name: updates.name ?? 'Updated Playlist',
    }),
    ...overrides,
  };
}

function createVideoCatalog(overrides: Partial<PlaylistVideoCatalogPort> = {}): PlaylistVideoCatalogPort {
  return {
    findById: async videoId => ({
      duration: 90,
      id: videoId,
      title: 'Playlist Video',
    }),
    getPlaylistVideos: async items => items.map(item => ({
      duration: 90,
      episodeMetadata: item.episodeMetadata,
      id: item.videoId,
      position: item.position,
      title: 'Playlist Video',
    })),
    ...overrides,
  };
}

function expectFailure(
  result: PlaylistResult<unknown>,
  expected: { reason: string; status: number },
) {
  expect(result.success).toBe(false);
  if (result.success) {
    throw new Error('Expected playlist service failure');
  }

  expect(result.reason).toBe(expected.reason);
  expect(result.status).toBe(expected.status);
}

describe('playlist composition owner contract', () => {
  test('mutations pass the explicit owner identity into use cases', async () => {
    let capturedOwnerId = '';
    const services = createServerPlaylistServices({
      playlistRepository: createPlaylistRepository({
        create: async (input) => {
          capturedOwnerId = input.ownerId;

          return buildPlaylist({
            id: 'created-playlist',
            name: input.name,
            ownerId: input.ownerId,
            type: input.type,
          });
        },
      }),
      videoCatalog: createVideoCatalog(),
    });

    const result = await services.createPlaylist.execute({
      name: 'Explicit Owner Playlist',
      ownerId: 'owner-1',
      type: 'user_created',
    });

    expect(result.success).toBe(true);
    expect(capturedOwnerId).toBe('owner-1');
  });

  test('maps route-facing failure statuses without owner fallback', async () => {
    const ownerPlaylistRepository = createPlaylistRepository({
      findById: async () => buildPlaylist({ videoIds: ['video-1'] }),
    });
    const permissionDeniedRepository = createPlaylistRepository({
      findById: async () => buildPlaylist({ ownerId: 'owner-2', videoIds: ['video-1'] }),
    });

    await expectFailure(
      await createServerPlaylistServices({
        playlistRepository: createPlaylistRepository(),
        videoCatalog: createVideoCatalog(),
      }).createPlaylist.execute({ name: '', ownerId: 'owner-1', type: 'user_created' }),
      { reason: 'INVALID_PLAYLIST_DATA', status: 400 },
    );
    await expectFailure(
      await createServerPlaylistServices({
        playlistRepository: createPlaylistRepository({ nameExistsForOwner: async () => true }),
        videoCatalog: createVideoCatalog(),
      }).createPlaylist.execute({ name: 'Duplicate Playlist', ownerId: 'owner-1', type: 'user_created' }),
      { reason: 'DUPLICATE_PLAYLIST_NAME', status: 409 },
    );
    await expectFailure(
      await createServerPlaylistServices({
        playlistRepository: permissionDeniedRepository,
        videoCatalog: createVideoCatalog(),
      }).updatePlaylist.execute({ name: 'Denied Update', ownerId: 'owner-1', playlistId: 'playlist-1' }),
      { reason: 'PLAYLIST_PERMISSION_DENIED', status: 403 },
    );
    await expectFailure(
      await createServerPlaylistServices({
        playlistRepository: ownerPlaylistRepository,
        videoCatalog: createVideoCatalog(),
      }).addVideoToPlaylist.execute({ ownerId: 'owner-1', playlistId: 'playlist-1', videoId: 'video-1' }),
      { reason: 'DUPLICATE_VIDEO_IN_PLAYLIST', status: 409 },
    );
    await expectFailure(
      await createServerPlaylistServices({
        playlistRepository: createPlaylistRepository(),
        videoCatalog: createVideoCatalog({ findById: async () => null }),
      }).addVideoToPlaylist.execute({ ownerId: 'owner-1', playlistId: 'playlist-1', videoId: 'missing-video' }),
      { reason: 'VIDEO_NOT_FOUND', status: 400 },
    );
    await expectFailure(
      await createServerPlaylistServices({
        playlistRepository: ownerPlaylistRepository,
        videoCatalog: createVideoCatalog(),
      }).removeVideoFromPlaylist.execute({ ownerId: 'owner-1', playlistId: 'playlist-1', videoId: 'missing-video' }),
      { reason: 'VIDEO_NOT_FOUND_IN_PLAYLIST', status: 404 },
    );
    await expectFailure(
      await createServerPlaylistServices({
        playlistRepository: ownerPlaylistRepository,
        videoCatalog: createVideoCatalog(),
      }).reorderPlaylistItems.execute({ newOrder: [], ownerId: 'owner-1', playlistId: 'playlist-1' }),
      { reason: 'VALIDATION_ERROR', status: 400 },
    );
    await expectFailure(
      await createServerPlaylistServices({
        playlistRepository: createPlaylistRepository({
          findWithFilters: async () => {
            throw new Error('playlist query unavailable');
          },
        }),
        videoCatalog: createVideoCatalog(),
      }).findPlaylists.execute({
        filters: {},
        includeEmpty: true,
        includeStats: false,
        limit: 20,
        offset: 0,
        ownerId: 'owner-1',
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
      { reason: 'PLAYLIST_QUERY_UNAVAILABLE', status: 503 },
    );
  });
});
