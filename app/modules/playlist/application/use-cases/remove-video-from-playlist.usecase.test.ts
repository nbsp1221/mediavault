import { describe, expect, test, vi } from 'vitest';
import type { Playlist } from '../../domain/playlist';
import { RemoveVideoFromPlaylistUseCase } from './remove-video-from-playlist.usecase';

function createPlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    createdAt: new Date('2026-03-08T00:00:00.000Z'),
    id: 'playlist-1',
    isPublic: false,
    name: 'Owned Playlist',
    ownerId: 'owner-1',
    type: 'user_created',
    updatedAt: new Date('2026-03-09T00:00:00.000Z'),
    videoIds: ['video-1'],
    ...overrides,
  };
}

describe('RemoveVideoFromPlaylistUseCase', () => {
  test('returns a not-found failure when the target video is not in the playlist', async () => {
    const removeVideoFromPlaylist = vi.fn();
    const useCase = new RemoveVideoFromPlaylistUseCase({
      playlistRepository: {
        findById: vi.fn(async () => createPlaylist()),
        removeVideoFromPlaylist,
      },
    });

    await expect(
      useCase.execute({
        ownerId: 'owner-1',
        playlistId: 'playlist-1',
        videoId: 'missing-video',
      }),
    ).resolves.toEqual({
      message: 'Video "missing-video" not found in playlist "playlist-1"',
      ok: false,
      reason: 'VIDEO_NOT_FOUND_IN_PLAYLIST',
    });

    expect(removeVideoFromPlaylist).not.toHaveBeenCalled();
  });

  test('returns removal details without a public success flag in the application output', async () => {
    const playlistBefore = createPlaylist({
      videoIds: ['video-1', 'video-2'],
    });
    const playlistAfter = createPlaylist({
      videoIds: ['video-1'],
    });
    const findById = vi
      .fn()
      .mockResolvedValueOnce(playlistBefore)
      .mockResolvedValueOnce(playlistAfter);
    const useCase = new RemoveVideoFromPlaylistUseCase({
      playlistRepository: {
        findById,
        removeVideoFromPlaylist: vi.fn(async () => undefined),
      },
    });

    await expect(
      useCase.execute({
        ownerId: 'owner-1',
        playlistId: 'playlist-1',
        videoId: 'video-2',
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        message: 'Video removed from playlist "Owned Playlist" successfully',
        playlistId: 'playlist-1',
        remainingVideos: 1,
        videoId: 'video-2',
      },
    });
  });
});
