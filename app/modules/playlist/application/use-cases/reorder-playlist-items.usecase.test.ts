import { describe, expect, test, vi } from 'vitest';
import type { Playlist, PlaylistItem } from '../../domain/playlist';
import { ReorderPlaylistItemsUseCase } from './reorder-playlist-items.usecase';

const playlist: Playlist = {
  id: 'playlist-1',
  name: 'Owned playlist',
  ownerId: 'owner-1',
  type: 'user_created',
  isPublic: false,
  videoIds: ['video-1', 'hidden', 'video-2'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function setup(options: { missing?: boolean; unavailable?: boolean } = {}) {
  const reorder = vi.fn(async (_id: string, _order: string[]) => undefined);
  const findById = vi.fn(async () => (options.missing ? null : playlist));
  const getPlaylistItems = vi.fn(async (): Promise<PlaylistItem[]> =>
    playlist.videoIds.map((videoId, position) => ({
      videoId,
      position,
      playlistId: playlist.id,
      addedBy: playlist.ownerId,
      addedAt: new Date(),
    })),
  );
  const getPlaylistVideos = vi.fn(async (items: PlaylistItem[]) => {
    if (options.unavailable) {
      throw new Error('unavailable');
    }
    return items
      .filter((item) => item.videoId !== 'hidden')
      .map((item) => ({
        id: item.videoId,
        title: item.videoId,
        position: item.position,
        duration: 60,
      }));
  });
  return {
    reorder,
    findById,
    getPlaylistItems,
    getPlaylistVideos,
    useCase: new ReorderPlaylistItemsUseCase({
      playlistRepository: { findById, getPlaylistItems, reorderPlaylistItems: reorder },
      videoCatalog: { getPlaylistVideos },
    }),
  };
}

describe('ReorderPlaylistItemsUseCase', () => {
  test('reorders accessible items while preserving hidden positions and not returning hidden IDs', async () => {
    const { useCase, reorder, getPlaylistVideos } = setup();
    const result = await useCase.execute({
      playlistId: playlist.id,
      ownerId: 'owner-1',
      newOrder: ['video-2', 'video-1'],
    });
    expect(result).toEqual({
      ok: true,
      data: {
        message: 'Playlist reordered successfully',
        newOrder: ['video-2', 'video-1'],
        oldOrder: ['video-1', 'video-2'],
        playlistName: playlist.name,
        videosReordered: 2,
      },
    });
    expect(reorder).toHaveBeenCalledWith(playlist.id, ['video-2', 'hidden', 'video-1']);
    expect(getPlaylistVideos).toHaveBeenCalledWith(expect.any(Array), {
      type: 'public_or_owned',
      ownerId: 'owner-1',
    });
    expect(JSON.stringify(result)).not.toContain('hidden');
  });
  test.each([
    { ids: ['video-1'] },
    { ids: ['video-2', 'video-1', 'video-1'] },
    { ids: ['video-1', 'hidden'] },
    { ids: ['video-1', 'other'] },
  ])('rejects invalid visible permutation $ids without modifying storage', async ({ ids }) => {
    const { useCase, reorder } = setup();
    const result = await useCase.execute({
      playlistId: playlist.id,
      ownerId: 'owner-1',
      newOrder: ids,
    });
    expect(result).toMatchObject({ ok: false, reason: 'PLAYLIST_REORDER_ERROR' });
    expect(reorder).not.toHaveBeenCalled();
  });
  test('rejects empty orders and unauthorized actors before catalog reads', async () => {
    const { useCase, reorder, getPlaylistVideos } = setup();
    expect(
      await useCase.execute({ playlistId: playlist.id, ownerId: 'owner-1', newOrder: [] }),
    ).toMatchObject({ ok: false, reason: 'VALIDATION_ERROR' });
    expect(
      await useCase.execute({
        playlistId: playlist.id,
        ownerId: 'other',
        newOrder: ['video-1', 'video-2'],
      }),
    ).toMatchObject({ ok: false, reason: 'PLAYLIST_PERMISSION_DENIED' });
    expect(getPlaylistVideos).not.toHaveBeenCalled();
    expect(reorder).not.toHaveBeenCalled();
  });
  test('returns not found and catalog failure without performing writes', async () => {
    const missing = setup({ missing: true });
    expect(
      await missing.useCase.execute({
        playlistId: 'missing',
        ownerId: 'owner-1',
        newOrder: ['video-1'],
      }),
    ).toMatchObject({ ok: false, reason: 'PLAYLIST_NOT_FOUND' });
    const failed = setup({ unavailable: true });
    expect(
      await failed.useCase.execute({
        playlistId: playlist.id,
        ownerId: 'owner-1',
        newOrder: ['video-1', 'video-2'],
      }),
    ).toMatchObject({ ok: false, reason: 'PLAYLIST_MUTATION_FAILED' });
    expect(failed.reorder).not.toHaveBeenCalled();
  });
});
