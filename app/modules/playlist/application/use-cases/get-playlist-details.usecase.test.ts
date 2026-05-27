import { describe, expect, test, vi } from 'vitest';
import type { Playlist, PlaylistItem } from '../../domain/playlist';
import { GetPlaylistDetailsUseCase } from './get-playlist-details.usecase';

function createPlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    createdAt: new Date('2026-03-08T00:00:00.000Z'),
    id: 'playlist-1',
    isPublic: false,
    metadata: {
      seriesName: 'Vault Saga',
    },
    name: 'Vault',
    ownerId: 'owner-1',
    type: 'season',
    updatedAt: new Date('2026-03-09T00:00:00.000Z'),
    videoIds: ['video-1', 'video-2'],
    ...overrides,
  };
}

function createPlaylistItem(overrides: Partial<PlaylistItem> = {}): PlaylistItem {
  return {
    addedAt: new Date('2026-03-09T00:00:00.000Z'),
    addedBy: 'owner-1',
    playlistId: 'playlist-1',
    position: 1,
    videoId: 'video-1',
    ...overrides,
  };
}

describe('GetPlaylistDetailsUseCase', () => {
  test('returns playlist details with permissions, paginated videos, stats, and only accessible related playlists', async () => {
    const findById = vi.fn(async () => createPlaylist());
    const getPlaylistItems = vi.fn(async (playlistId: string) => {
      return playlistId === 'series-public'
        ? [
            createPlaylistItem({
              playlistId,
              videoId: 'video-9',
            }),
          ]
        : [
            createPlaylistItem(),
            createPlaylistItem({
              position: 2,
              videoId: 'video-2',
            }),
          ];
    });
    const findBySeries = vi.fn(async () => [
      createPlaylist({
        id: 'playlist-1',
      }),
      createPlaylist({
        id: 'series-public',
        isPublic: true,
        ownerId: 'other-user',
        type: 'series',
        videoIds: ['video-9'],
      }),
      createPlaylist({
        id: 'season-private',
        isPublic: false,
        ownerId: 'other-user',
        type: 'season',
        videoIds: ['video-3'],
      }),
    ]);
    const getPlaylistVideos = vi.fn(async (items: PlaylistItem[]) => items.map(item => ({
      duration: item.videoId === 'video-2' ? 120 : 100,
      id: item.videoId,
      position: item.position,
      title: item.videoId === 'video-2' ? 'Episode 2' : 'Episode 1',
    })));
    const useCase = new GetPlaylistDetailsUseCase({
      playlistRepository: {
        findById,
        findBySeries,
        getPlaylistItems,
      },
      videoCatalog: {
        findById: vi.fn(),
        getPlaylistVideos,
      },
    });

    const result = await useCase.execute({
      includeRelated: true,
      includeStats: true,
      includeVideos: true,
      ownerId: 'owner-1',
      playlistId: 'playlist-1',
      videoLimit: 1,
      videoOffset: 0,
    });

    expect(findById).toHaveBeenCalledWith('playlist-1');
    expect(getPlaylistItems).toHaveBeenCalledWith('playlist-1');
    expect(getPlaylistVideos).toHaveBeenCalledWith(
      [
        expect.objectContaining({ videoId: 'video-1' }),
        expect.objectContaining({ videoId: 'video-2' }),
      ],
      {
        ownerId: 'owner-1',
        type: 'public_or_owned',
      },
    );
    expect(findBySeries).toHaveBeenCalledWith('Vault Saga');
    expect(result).toEqual({
      ok: true,
      data: {
        permissions: {
          canAddVideos: true,
          canDelete: true,
          canEdit: true,
          canShare: true,
        },
        playlist: expect.objectContaining({
          id: 'playlist-1',
          stats: expect.objectContaining({
            id: 'playlist-1',
            totalVideos: 2,
          }),
          videos: [
            expect.objectContaining({
              id: 'video-1',
              title: 'Episode 1',
            }),
          ],
        }),
        relatedPlaylists: [
          {
            id: 'series-public',
            name: 'Vault',
            relationship: 'parent',
            type: 'series',
            videoCount: 1,
          },
        ],
        stats: expect.objectContaining({
          id: 'playlist-1',
          totalVideos: 2,
        }),
        videoPagination: {
          hasMore: true,
          limit: 1,
          offset: 0,
          total: 2,
        },
      },
    });
  });

  test('returns a not-found result when the playlist does not exist', async () => {
    const useCase = new GetPlaylistDetailsUseCase({
      playlistRepository: {
        findById: vi.fn(async () => null),
        findBySeries: vi.fn(),
        getPlaylistItems: vi.fn(),
      },
      videoCatalog: {
        findById: vi.fn(),
        getPlaylistVideos: vi.fn(),
      },
    });

    await expect(useCase.execute({
      includeRelated: false,
      includeStats: false,
      includeVideos: false,
      playlistId: 'missing-playlist',
      videoLimit: 50,
      videoOffset: 0,
    })).resolves.toEqual({
      message: 'Playlist with ID "missing-playlist" not found',
      ok: false,
      reason: 'PLAYLIST_NOT_FOUND',
    });
  });

  test('rejects invalid video pagination values before loading playlist data', async () => {
    const findById = vi.fn();
    const findBySeries = vi.fn();
    const getPlaylistItems = vi.fn();
    const getPlaylistVideos = vi.fn();
    const useCase = new GetPlaylistDetailsUseCase({
      playlistRepository: {
        findById,
        findBySeries,
        getPlaylistItems,
      },
      videoCatalog: {
        findById: vi.fn(),
        getPlaylistVideos,
      },
    });

    await expect(useCase.execute({
      includeRelated: false,
      includeStats: false,
      includeVideos: true,
      playlistId: 'playlist-1',
      videoLimit: Number.NaN,
      videoOffset: 0,
    })).resolves.toEqual({
      message: 'Video limit must be an integer between 1 and 100',
      ok: false,
      reason: 'VALIDATION_ERROR',
    });

    await expect(useCase.execute({
      includeRelated: false,
      includeStats: false,
      includeVideos: true,
      playlistId: 'playlist-1',
      videoLimit: 20,
      videoOffset: 0.5,
    })).resolves.toEqual({
      message: 'Video offset must be a non-negative integer',
      ok: false,
      reason: 'VALIDATION_ERROR',
    });

    await expect(useCase.execute({
      includeRelated: false,
      includeStats: false,
      includeVideos: true,
      playlistId: 'playlist-1',
      videoLimit: Number.POSITIVE_INFINITY,
      videoOffset: -1,
    })).resolves.toEqual({
      message: 'Video limit must be an integer between 1 and 100',
      ok: false,
      reason: 'VALIDATION_ERROR',
    });

    expect(findById).not.toHaveBeenCalled();
    expect(findBySeries).not.toHaveBeenCalled();
    expect(getPlaylistItems).not.toHaveBeenCalled();
    expect(getPlaylistVideos).not.toHaveBeenCalled();
  });
});
