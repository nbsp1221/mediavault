import { describe, expect, test, vi } from 'vitest';
import type { Playlist } from '../../domain/playlist';
import { DeletePlaylistUseCase } from './delete-playlist.usecase';

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
    type: 'series',
    updatedAt: new Date('2026-03-09T00:00:00.000Z'),
    videoIds: ['video-1', 'video-2'],
    ...overrides,
  };
}

describe('DeletePlaylistUseCase', () => {
  test('denies deletes for non-owners', async () => {
    const deletePlaylist = vi.fn();
    const useCase = new DeletePlaylistUseCase({
      playlistRepository: {
        delete: deletePlaylist,
        findById: vi.fn(async () => createPlaylist()),
      },
    });

    await expect(
      useCase.execute({
        ownerId: 'intruder-owner',
        playlistId: 'playlist-1',
      }),
    ).resolves.toEqual({
      message: 'User "intruder-owner" does not have permission to delete playlist "playlist-1"',
      ok: false,
      reason: 'PLAYLIST_PERMISSION_DENIED',
    });

    expect(deletePlaylist).not.toHaveBeenCalled();
  });

  test('returns deletion details without a public success flag in the application output', async () => {
    const useCase = new DeletePlaylistUseCase({
      playlistRepository: {
        delete: vi.fn(async () => true),
        findById: vi.fn(async () => createPlaylist()),
      },
    });

    await expect(
      useCase.execute({
        ownerId: 'owner-1',
        playlistId: 'playlist-1',
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        deletedPlaylistName: 'Vault',
        message: 'Playlist "Vault" deleted successfully',
      },
    });
  });
});
