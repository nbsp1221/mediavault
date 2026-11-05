import { describe, expect, test, vi } from 'vitest';
import type { Playlist } from '../../domain/playlist';
import type { PlaylistRepositoryPort } from '../ports/playlist-repository.port';
import type { PlaylistVideoCatalogPort } from '../ports/playlist-video-catalog.port';
import { AddVideoToPlaylistUseCase } from './add-video-to-playlist.usecase';
import { DeletePlaylistUseCase } from './delete-playlist.usecase';
import { RemoveVideoFromPlaylistUseCase } from './remove-video-from-playlist.usecase';
import { ReorderPlaylistItemsUseCase } from './reorder-playlist-items.usecase';

function playlist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    id: 'playlist-owned',
    name: 'Owned playlist',
    ownerId: 'owner-1',
    type: 'user_created',
    isPublic: false,
    videoIds: ['video-1', 'video-2'],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    ...overrides,
  };
}

const identity = { ownerId: 'owner-1', playlistId: 'playlist-owned' };

function setupAdd(stored = playlist()) {
  const findById = vi.fn<PlaylistRepositoryPort['findById']>().mockResolvedValue(stored);
  const addVideoToPlaylist = vi
    .fn<PlaylistRepositoryPort['addVideoToPlaylist']>()
    .mockResolvedValue(undefined);
  const findVideo = vi
    .fn<PlaylistVideoCatalogPort['findById']>()
    .mockResolvedValue({ id: 'video-new', title: 'New video', duration: 10 });
  return {
    findById,
    addVideoToPlaylist,
    findVideo,
    useCase: new AddVideoToPlaylistUseCase({
      playlistRepository: { findById, addVideoToPlaylist },
      videoCatalog: { findById: findVideo },
    }),
  };
}

function setupRemove(stored = playlist()) {
  const findById = vi.fn<PlaylistRepositoryPort['findById']>().mockResolvedValue(stored);
  const removeVideoFromPlaylist = vi
    .fn<PlaylistRepositoryPort['removeVideoFromPlaylist']>()
    .mockResolvedValue(undefined);
  return {
    findById,
    removeVideoFromPlaylist,
    useCase: new RemoveVideoFromPlaylistUseCase({
      playlistRepository: { findById, removeVideoFromPlaylist },
    }),
  };
}

function setupReorder(stored = playlist()) {
  const findById = vi.fn<PlaylistRepositoryPort['findById']>().mockResolvedValue(stored);
  const items = stored.videoIds.map((videoId, index) => ({
    playlistId: stored.id,
    videoId,
    position: index + 1,
    addedAt: stored.createdAt,
    addedBy: stored.ownerId,
  }));
  const getPlaylistItems = vi
    .fn<PlaylistRepositoryPort['getPlaylistItems']>()
    .mockResolvedValue(items);
  const getPlaylistVideos = vi
    .fn<PlaylistVideoCatalogPort['getPlaylistVideos']>()
    .mockImplementation(async (items) =>
      items
        .filter((item) => !item.videoId.startsWith('hidden-'))
        .map((item) => ({
          id: item.videoId,
          title: item.videoId,
          duration: 10,
          position: item.position,
        })),
    );
  const reorderPlaylistItems = vi
    .fn<PlaylistRepositoryPort['reorderPlaylistItems']>()
    .mockResolvedValue(undefined);
  return {
    items,
    findById,
    getPlaylistItems,
    getPlaylistVideos,
    reorderPlaylistItems,
    useCase: new ReorderPlaylistItemsUseCase({
      playlistRepository: { findById, getPlaylistItems, reorderPlaylistItems },
      videoCatalog: { getPlaylistVideos },
    }),
  };
}

describe('playlist membership ownership and insertion', () => {
  test.each([false, true])(
    'public=%s does not grant a non-owner add or remove authority',
    async (isPublic) => {
      const stored = playlist({ ownerId: 'another-owner', isPublic });
      const add = setupAdd(stored);
      const remove = setupRemove(stored);
      await expect(
        add.useCase.execute({ ...identity, videoId: 'video-new' }),
      ).resolves.toMatchObject({ ok: false, reason: 'PLAYLIST_PERMISSION_DENIED' });
      await expect(
        remove.useCase.execute({ ...identity, videoId: 'video-1' }),
      ).resolves.toMatchObject({ ok: false, reason: 'PLAYLIST_PERMISSION_DENIED' });
      expect(add.findVideo).not.toHaveBeenCalled();
      expect(add.addVideoToPlaylist).not.toHaveBeenCalled();
      expect(remove.removeVideoFromPlaylist).not.toHaveBeenCalled();
      expect(add.findById).toHaveBeenCalledTimes(1);
      expect(remove.findById).toHaveBeenCalledTimes(1);
    },
  );

  test.each([-1, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY])(
    'rejects invalid insertion position %s without a membership write',
    async (position) => {
      const state = setupAdd();
      await expect(
        state.useCase.execute({ ...identity, videoId: 'video-new', position }),
      ).resolves.toMatchObject({ ok: false, reason: 'INVALID_PLAYLIST_POSITION' });
      expect(state.findVideo).toHaveBeenCalledExactlyOnceWith('video-new', {
        type: 'public_or_owned',
        ownerId: 'owner-1',
      });
      expect(state.addVideoToPlaylist).not.toHaveBeenCalled();
    },
  );

  test.each([undefined, 0, 2])(
    'forwards insertion index %s and episode metadata without changing their meaning',
    async (position) => {
      const state = setupAdd();
      const episodeMetadata = { episodeNumber: 3, episodeTitle: 'Third episode', watchProgress: 0 };
      await expect(
        state.useCase.execute({ ...identity, videoId: 'video-new', position, episodeMetadata }),
      ).resolves.toMatchObject({ ok: true, data: { finalPosition: position ?? 2 } });
      expect(state.addVideoToPlaylist).toHaveBeenCalledExactlyOnceWith(
        'playlist-owned',
        'video-new',
        position ?? 2,
        episodeMetadata,
      );
      expect(state.findById.mock.calls).toStrictEqual([['playlist-owned'], ['playlist-owned']]);
    },
  );

  test('does not read the catalog or mutate membership for a missing playlist', async () => {
    const state = setupAdd();
    state.findById.mockResolvedValueOnce(null);
    await expect(
      state.useCase.execute({ ...identity, videoId: 'video-new' }),
    ).resolves.toMatchObject({ ok: false, reason: 'PLAYLIST_NOT_FOUND' });
    expect(state.findVideo).not.toHaveBeenCalled();
    expect(state.addVideoToPlaylist).not.toHaveBeenCalled();
    const remove = setupRemove();
    remove.findById.mockResolvedValueOnce(null);
    await expect(
      remove.useCase.execute({ ...identity, videoId: 'video-1' }),
    ).resolves.toMatchObject({ ok: false, reason: 'PLAYLIST_NOT_FOUND' });
    expect(remove.removeVideoFromPlaylist).not.toHaveBeenCalled();
  });

  test.each(['lookup', 'catalog', 'write', 'refresh'] as const)(
    'reports add %s failure without repeating a membership write',
    async (stage) => {
      const state = setupAdd();
      if (stage === 'lookup') {
        state.findById.mockRejectedValueOnce(new Error('lookup unavailable'));
      }
      if (stage === 'catalog') {
        state.findVideo.mockRejectedValueOnce(new Error('catalog unavailable'));
      }
      if (stage === 'write') {
        state.addVideoToPlaylist.mockRejectedValueOnce(new Error('write unavailable'));
      }
      if (stage === 'refresh') {
        state.findById
          .mockResolvedValueOnce(playlist())
          .mockRejectedValueOnce(new Error('refresh unavailable'));
      }
      await expect(
        state.useCase.execute({ ...identity, videoId: 'video-new' }),
      ).resolves.toMatchObject({ ok: false, reason: 'PLAYLIST_MUTATION_FAILED' });
      expect(state.addVideoToPlaylist).toHaveBeenCalledTimes(
        stage === 'lookup' || stage === 'catalog' ? 0 : 1,
      );
    },
  );

  test.each(['lookup', 'write', 'refresh'] as const)(
    'reports remove %s failure without repeating a membership write',
    async (stage) => {
      const state = setupRemove();
      if (stage === 'lookup') {
        state.findById.mockRejectedValueOnce(new Error('lookup unavailable'));
      }
      if (stage === 'write') {
        state.removeVideoFromPlaylist.mockRejectedValueOnce(new Error('write unavailable'));
      }
      if (stage === 'refresh') {
        state.findById
          .mockResolvedValueOnce(playlist())
          .mockRejectedValueOnce(new Error('refresh unavailable'));
      }
      await expect(
        state.useCase.execute({ ...identity, videoId: 'video-1' }),
      ).resolves.toMatchObject({ ok: false, reason: 'PLAYLIST_MUTATION_FAILED' });
      expect(state.removeVideoFromPlaylist).toHaveBeenCalledTimes(stage === 'lookup' ? 0 : 1);
    },
  );
});

describe('playlist deletion outcome', () => {
  test.each(['missing', 'declined', 'lookup rejection', 'delete rejection'] as const)(
    'does not report success for %s',
    async (stage) => {
      const findById = vi.fn<PlaylistRepositoryPort['findById']>().mockResolvedValue(playlist());
      const remove = vi.fn<PlaylistRepositoryPort['delete']>().mockResolvedValue(true);
      if (stage === 'missing') {
        findById.mockResolvedValueOnce(null);
      }
      if (stage === 'declined') {
        remove.mockResolvedValueOnce(false);
      }
      if (stage === 'lookup rejection') {
        findById.mockRejectedValueOnce(new Error('lookup unavailable'));
      }
      if (stage === 'delete rejection') {
        remove.mockRejectedValueOnce(new Error('write unavailable'));
      }
      const useCase = new DeletePlaylistUseCase({
        playlistRepository: { findById, delete: remove },
      });
      await expect(useCase.execute(identity)).resolves.toMatchObject({
        ok: false,
        reason: stage === 'missing' ? 'PLAYLIST_NOT_FOUND' : 'PLAYLIST_MUTATION_FAILED',
      });
      expect(remove.mock.calls).toStrictEqual(
        stage === 'missing' || stage === 'lookup rejection' ? [] : [['playlist-owned']],
      );
    },
  );
});

describe('visible playlist permutation and hidden item preservation', () => {
  test.each([
    ['video-1', ''],
    ['', 'video-2'],
  ])(
    'rejects a mixed valid/empty ID order %j before item or catalog reads',
    async (...newOrder) => {
      const state = setupReorder();
      await expect(state.useCase.execute({ ...identity, newOrder })).resolves.toMatchObject({
        ok: false,
        reason: 'VALIDATION_ERROR',
      });
      expect(state.getPlaylistItems).not.toHaveBeenCalled();
      expect(state.getPlaylistVideos).not.toHaveBeenCalled();
      expect(state.reorderPlaylistItems).not.toHaveBeenCalled();
    },
  );

  test('rejects an order containing every current ID plus an extra ID rather than silently discarding the extra', async () => {
    const state = setupReorder();
    await expect(
      state.useCase.execute({ ...identity, newOrder: ['video-2', 'video-1', 'extra-video'] }),
    ).resolves.toMatchObject({ ok: false, reason: 'PLAYLIST_REORDER_ERROR' });
    expect(state.reorderPlaylistItems).not.toHaveBeenCalled();
  });

  test('reorders three visible items through hidden prefix, middle and suffix slots without exposing hidden IDs', async () => {
    const stored = playlist({
      videoIds: [
        'hidden-prefix',
        'video-1',
        'hidden-middle',
        'video-2',
        'video-3',
        'hidden-suffix',
      ],
    });
    const state = setupReorder(stored);
    const newOrder = ['video-3', 'video-1', 'video-2'];
    const result = await state.useCase.execute({ ...identity, newOrder });
    expect(result).toMatchObject({
      ok: true,
      data: {
        newOrder,
        oldOrder: ['video-1', 'video-2', 'video-3'],
        playlistName: 'Owned playlist',
      },
    });
    expect(state.getPlaylistVideos).toHaveBeenCalledExactlyOnceWith(state.items, {
      type: 'public_or_owned',
      ownerId: 'owner-1',
    });
    expect(state.reorderPlaylistItems.mock.calls).toStrictEqual([
      [
        'playlist-owned',
        ['hidden-prefix', 'video-3', 'hidden-middle', 'video-1', 'video-2', 'hidden-suffix'],
      ],
    ]);
    expect(JSON.stringify(result)).not.toContain('hidden-');
    expect(stored.videoIds).toEqual([
      'hidden-prefix',
      'video-1',
      'hidden-middle',
      'video-2',
      'video-3',
      'hidden-suffix',
    ]);
  });

  test.each(['lookup', 'items', 'catalog', 'write'] as const)(
    'does not report reorder success when %s fails',
    async (stage) => {
      const state = setupReorder();
      if (stage === 'lookup') {
        state.findById.mockRejectedValueOnce(new Error('lookup unavailable'));
      }
      if (stage === 'items') {
        state.getPlaylistItems.mockRejectedValueOnce(new Error('items unavailable'));
      }
      if (stage === 'catalog') {
        state.getPlaylistVideos.mockRejectedValueOnce(new Error('catalog unavailable'));
      }
      if (stage === 'write') {
        state.reorderPlaylistItems.mockRejectedValueOnce(new Error('write unavailable'));
      }
      await expect(
        state.useCase.execute({ ...identity, newOrder: ['video-2', 'video-1'] }),
      ).resolves.toMatchObject({ ok: false, reason: 'PLAYLIST_MUTATION_FAILED' });
      expect(state.reorderPlaylistItems).toHaveBeenCalledTimes(stage === 'write' ? 1 : 0);
    },
  );
});
