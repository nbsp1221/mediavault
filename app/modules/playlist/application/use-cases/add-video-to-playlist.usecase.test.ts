import { describe, expect, test, vi } from 'vitest';
import type { Playlist } from '../../domain/playlist';
import { AddVideoToPlaylistUseCase } from './add-video-to-playlist.usecase';

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

describe('AddVideoToPlaylistUseCase', () => {
  test('rejects duplicate videos in the same playlist', async () => {
    const addVideoToPlaylist = vi.fn();
    const useCase = new AddVideoToPlaylistUseCase({
      playlistRepository: {
        addVideoToPlaylist,
        findById: vi.fn(async () => createPlaylist()),
      },
      videoCatalog: {
        findById: vi.fn(),
      },
    });

    await expect(useCase.execute({
      ownerId: 'owner-1',
      playlistId: 'playlist-1',
      videoId: 'video-1',
    })).resolves.toEqual({
      message: 'Video "video-1" is already in playlist "playlist-1"',
      ok: false,
      reason: 'DUPLICATE_VIDEO_IN_PLAYLIST',
    });

    expect(addVideoToPlaylist).not.toHaveBeenCalled();
  });

  test('returns a validation failure when the video catalog cannot resolve the requested video', async () => {
    const addVideoToPlaylist = vi.fn();
    const findById = vi.fn(async () => null);
    const useCase = new AddVideoToPlaylistUseCase({
      playlistRepository: {
        addVideoToPlaylist,
        findById: vi.fn(async () => createPlaylist()),
      },
      videoCatalog: {
        findById,
      },
    });

    await expect(useCase.execute({
      ownerId: 'owner-1',
      playlistId: 'playlist-1',
      videoId: 'missing-video',
    })).resolves.toEqual({
      message: 'Video with ID "missing-video" not found',
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });

    expect(findById).toHaveBeenCalledWith('missing-video', {
      ownerId: 'owner-1',
      type: 'public_or_owned',
    });
    expect(addVideoToPlaylist).not.toHaveBeenCalled();
  });

  test('rejects positions outside the current 0-based insertion range', async () => {
    const addVideoToPlaylist = vi.fn();
    const useCase = new AddVideoToPlaylistUseCase({
      playlistRepository: {
        addVideoToPlaylist,
        findById: vi.fn(async () => createPlaylist()),
      },
      videoCatalog: {
        findById: vi.fn(async () => ({
          duration: 100,
          id: 'video-2',
          title: 'Vault Companion',
        })),
      },
    });

    await expect(useCase.execute({
      ownerId: 'owner-1',
      playlistId: 'playlist-1',
      position: 2,
      videoId: 'video-2',
    })).resolves.toEqual({
      message: 'Invalid position 2. Must be between 0 and 1',
      ok: false,
      reason: 'INVALID_PLAYLIST_POSITION',
    });

    expect(addVideoToPlaylist).not.toHaveBeenCalled();
  });

  test('rejects non-integer and NaN positions before mutating the playlist', async () => {
    const addVideoToPlaylist = vi.fn();
    const useCase = new AddVideoToPlaylistUseCase({
      playlistRepository: {
        addVideoToPlaylist,
        findById: vi.fn(async () => createPlaylist()),
      },
      videoCatalog: {
        findById: vi.fn(async () => ({
          duration: 100,
          id: 'video-2',
          title: 'Vault Companion',
        })),
      },
    });

    await expect(useCase.execute({
      ownerId: 'owner-1',
      playlistId: 'playlist-1',
      position: 0.5,
      videoId: 'video-2',
    })).resolves.toEqual({
      message: 'Invalid position 0.5. Must be between 0 and 1',
      ok: false,
      reason: 'INVALID_PLAYLIST_POSITION',
    });

    await expect(useCase.execute({
      ownerId: 'owner-1',
      playlistId: 'playlist-1',
      position: Number.NaN,
      videoId: 'video-2',
    })).resolves.toEqual({
      message: 'Invalid position NaN. Must be between 0 and 1',
      ok: false,
      reason: 'INVALID_PLAYLIST_POSITION',
    });

    expect(addVideoToPlaylist).not.toHaveBeenCalled();
  });

  test('preserves finalPosition as a 0-based insertion index even though storage positions remain 1-based', async () => {
    const playlistBefore = createPlaylist();
    const playlistAfter = createPlaylist({
      videoIds: ['video-2', 'video-1'],
    });
    const findById = vi.fn()
      .mockResolvedValueOnce(playlistBefore)
      .mockResolvedValueOnce(playlistAfter);
    const addVideoToPlaylist = vi.fn(async () => undefined);
    const useCase = new AddVideoToPlaylistUseCase({
      playlistRepository: {
        addVideoToPlaylist,
        findById,
      },
      videoCatalog: {
        findById: vi.fn(async () => ({
          duration: 100,
          id: 'video-2',
          title: 'Vault Companion',
        })),
      },
    });

    await expect(useCase.execute({
      ownerId: 'owner-1',
      playlistId: 'playlist-1',
      position: 0,
      videoId: 'video-2',
    })).resolves.toEqual({
      ok: true,
      data: {
        finalPosition: 0,
        message: 'Video "Vault Companion" added to playlist "Owned Playlist" successfully',
        playlistName: 'Owned Playlist',
        totalVideosInPlaylist: 2,
        videoTitle: 'Vault Companion',
      },
    });

    expect(addVideoToPlaylist).toHaveBeenCalledWith('playlist-1', 'video-2', 0, undefined);
  });
});
