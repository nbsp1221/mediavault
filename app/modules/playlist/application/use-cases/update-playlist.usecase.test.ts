import { describe, expect, test, vi } from 'vitest';
import type { Playlist } from '../../domain/playlist';
import type { UpdatePlaylistPortInput } from '../ports/playlist-repository.port';
import { UpdatePlaylistUseCase } from './update-playlist.usecase';

function createPlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    createdAt: new Date('2026-03-08T00:00:00.000Z'),
    description: 'Original description',
    id: 'playlist-1',
    isPublic: false,
    metadata: {
      genre: ['vault'],
      seriesName: 'Vault Saga',
    },
    name: 'Vault',
    ownerId: 'owner-1',
    type: 'series',
    updatedAt: new Date('2026-03-09T00:00:00.000Z'),
    videoIds: ['video-1'],
    ...overrides,
  };
}

describe('UpdatePlaylistUseCase', () => {
  test('returns the existing playlist unchanged when the update is a no-op', async () => {
    const findById = vi.fn(async () => createPlaylist());
    const update = vi.fn();
    const useCase = new UpdatePlaylistUseCase({
      playlistRepository: {
        findById,
        nameExistsForOwner: vi.fn(),
        update,
      },
    });

    await expect(
      useCase.execute({
        description: 'Original description',
        isPublic: false,
        name: 'Vault',
        ownerId: 'owner-1',
        playlistId: 'playlist-1',
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        fieldsUpdated: [],
        message: 'No changes were made to the playlist',
        playlist: createPlaylist(),
      },
    });

    expect(update).not.toHaveBeenCalled();
  });

  test('treats a trim-equivalent name as a no-op and skips duplicate checks', async () => {
    const playlist = createPlaylist();
    const nameExistsForOwner = vi.fn();
    const update = vi.fn();
    const useCase = new UpdatePlaylistUseCase({
      playlistRepository: {
        findById: vi.fn(async () => playlist),
        nameExistsForOwner,
        update,
      },
    });

    await expect(
      useCase.execute({
        name: '  Vault  ',
        ownerId: 'owner-1',
        playlistId: 'playlist-1',
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        fieldsUpdated: [],
        message: 'No changes were made to the playlist',
        playlist,
      },
    });

    expect(nameExistsForOwner).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test('updates changed fields, merges metadata, and reports the changed field list', async () => {
    const playlist = createPlaylist();
    const nameExistsForOwner = vi.fn(async () => false);
    const update = vi.fn(async (_id: string, updates: UpdatePlaylistPortInput) => ({
      ...playlist,
      ...updates,
      metadata: updates.metadata,
      name: updates.name ?? playlist.name,
      description: updates.description,
      isPublic: updates.isPublic ?? playlist.isPublic,
    }));
    const useCase = new UpdatePlaylistUseCase({
      playlistRepository: {
        findById: vi.fn(async () => playlist),
        nameExistsForOwner,
        update,
      },
    });

    await expect(
      useCase.execute({
        description: '  Updated description  ',
        isPublic: true,
        metadata: {
          year: 2026,
        },
        name: '  Updated Vault  ',
        ownerId: 'owner-1',
        playlistId: 'playlist-1',
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        fieldsUpdated: ['name', 'description', 'isPublic', 'metadata'],
        message: 'Playlist "Updated Vault" updated successfully',
        playlist: {
          description: 'Updated description',
          isPublic: true,
          metadata: {
            genre: ['vault'],
            seriesName: 'Vault Saga',
            year: 2026,
          },
          name: 'Updated Vault',
        },
      },
    });

    expect(nameExistsForOwner).toHaveBeenCalledWith('Updated Vault', 'owner-1', 'playlist-1');
    expect(update).toHaveBeenCalledWith('playlist-1', {
      description: 'Updated description',
      isPublic: true,
      metadata: {
        genre: ['vault'],
        seriesName: 'Vault Saga',
        year: 2026,
      },
      name: 'Updated Vault',
    });
  });
});
