import { describe, expect, test, vi } from 'vitest';
import type { Playlist, PlaylistItem } from '../../domain/playlist';
import type { PlaylistRepositoryPort } from '../ports/playlist-repository.port';
import type { PlaylistVideoCatalogPort } from '../ports/playlist-video-catalog.port';
import { type FindPlaylistsInput, FindPlaylistsUseCase } from './find-playlists.usecase';
import {
  type GetPlaylistDetailsInput,
  GetPlaylistDetailsUseCase,
} from './get-playlist-details.usecase';

function playlist(id: string, overrides: Partial<Playlist> = {}): Playlist {
  return {
    id,
    name: id,
    ownerId: 'owner-1',
    type: 'season',
    isPublic: true,
    videoIds: ['visible-1', 'hidden-secret', 'visible-2'],
    metadata: { seriesName: 'Saga' },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    ...overrides,
  };
}

function itemsFor(stored: Playlist): PlaylistItem[] {
  return stored.videoIds.map((videoId, index) => ({
    videoId,
    position: index + 1,
    playlistId: stored.id,
    addedBy: stored.ownerId,
    addedAt: stored.createdAt,
  }));
}

function catalog() {
  return {
    findById: vi.fn<PlaylistVideoCatalogPort['findById']>().mockResolvedValue(null),
    getPlaylistVideos: vi
      .fn<PlaylistVideoCatalogPort['getPlaylistVideos']>()
      .mockImplementation(async (items) =>
        items
          .filter((item) => !item.videoId.startsWith('hidden-'))
          .map((item) => ({
            id: item.videoId,
            title: item.videoId,
            position: item.position,
            duration: 10,
          })),
      ),
  };
}

function setupFind(stored = [playlist('playlist-current')]) {
  const findWithFilters = vi
    .fn<PlaylistRepositoryPort['findWithFilters']>()
    .mockResolvedValue(stored);
  const getPlaylistItems = vi
    .fn<PlaylistRepositoryPort['getPlaylistItems']>()
    .mockImplementation(async (id) => {
      const value = stored.find((candidate) => candidate.id === id);
      return value ? itemsFor(value) : [];
    });
  const videos = catalog();
  return {
    findWithFilters,
    getPlaylistItems,
    videos,
    useCase: new FindPlaylistsUseCase({
      playlistRepository: { findWithFilters, getPlaylistItems },
      videoCatalog: videos,
    }),
  };
}

const findInput: FindPlaylistsInput = {
  filters: {},
  includeEmpty: true,
  limit: 20,
  offset: 0,
  sortBy: 'name',
  sortOrder: 'asc',
};

function setupDetails(current = playlist('playlist-current'), related: Playlist[] = []) {
  const findById = vi.fn<PlaylistRepositoryPort['findById']>().mockResolvedValue(current);
  const findBySeries = vi.fn<PlaylistRepositoryPort['findBySeries']>().mockResolvedValue(related);
  const getPlaylistItems = vi
    .fn<PlaylistRepositoryPort['getPlaylistItems']>()
    .mockImplementation(async (id) => {
      const value = [current, ...related].find((candidate) => candidate.id === id);
      return value ? itemsFor(value) : [];
    });
  const videos = catalog();
  return {
    findById,
    findBySeries,
    getPlaylistItems,
    videos,
    useCase: new GetPlaylistDetailsUseCase({
      playlistRepository: { findById, findBySeries, getPlaylistItems },
      videoCatalog: videos,
    }),
  };
}

const detailsInput: GetPlaylistDetailsInput = {
  playlistId: 'playlist-current',
  includeRelated: false,
  includeVideos: true,
  videoLimit: 20,
  videoOffset: 0,
};
const invalidPagination = [
  { label: 'zero limit', limit: 0, offset: 0 },
  { label: 'negative limit', limit: -1, offset: 0 },
  { label: 'oversized limit', limit: 101, offset: 0 },
  { label: 'fractional limit', limit: 1.5, offset: 0 },
  { label: 'NaN limit', limit: Number.NaN, offset: 0 },
  { label: 'infinite limit', limit: Number.POSITIVE_INFINITY, offset: 0 },
  { label: 'negative offset', limit: 20, offset: -1 },
  { label: 'fractional offset', limit: 20, offset: 0.5 },
  { label: 'NaN offset', limit: 20, offset: Number.NaN },
  { label: 'infinite offset', limit: 20, offset: Number.POSITIVE_INFINITY },
];

describe('playlist catalog query boundaries', () => {
  test.each(invalidPagination)('rejects $label before all I/O', async ({ limit, offset }) => {
    const state = setupFind();
    await expect(state.useCase.execute({ ...findInput, limit, offset })).resolves.toMatchObject({
      ok: false,
      reason: 'VALIDATION_ERROR',
    });
    expect(state.findWithFilters).not.toHaveBeenCalled();
    expect(state.getPlaylistItems).not.toHaveBeenCalled();
    expect(state.videos.getPlaylistVideos).not.toHaveBeenCalled();
  });

  test.each([1, 100])('accepts the inclusive page-size boundary %i', async (limit) => {
    const state = setupFind();
    await expect(state.useCase.execute({ ...findInput, limit })).resolves.toMatchObject({
      ok: true,
      data: { playlists: [{ id: 'playlist-current' }], pagination: { limit } },
    });
    expect(state.findWithFilters).toHaveBeenCalledTimes(1);
  });

  test('preserves every authenticated search filter and passes viewer scope separately without mutating caller filters', async () => {
    const stored = playlist('playlist-current', {
      name: '가족 C++',
      ownerId: 'filtered-owner',
      metadata: { seriesName: 'Saga', genre: ['drama'] },
    });
    const state = setupFind([stored]);
    const filters = {
      searchQuery: '가족 C++',
      genre: ['drama'],
      ownerId: 'filtered-owner',
      isPublic: true,
      seriesName: 'Saga',
    };
    const result = await state.useCase.execute({ ...findInput, filters, ownerId: 'viewer-owner' });
    expect(state.findWithFilters.mock.calls).toStrictEqual([[filters]]);
    expect(state.videos.getPlaylistVideos).toHaveBeenCalledExactlyOnceWith(itemsFor(stored), {
      type: 'public_or_owned',
      ownerId: 'viewer-owner',
    });
    expect(result).toMatchObject({
      ok: true,
      data: { filters, playlists: [{ videoIds: ['visible-1', 'visible-2'] }] },
    });
    expect(filters).toEqual({
      searchQuery: '가족 C++',
      genre: ['drama'],
      ownerId: 'filtered-owner',
      isPublic: true,
      seriesName: 'Saga',
    });
  });

  test('forces anonymous public-only filtering while preserving the rest of the requested search', async () => {
    const stored = playlist('playlist-current', { name: 'Saga', ownerId: 'filtered-owner' });
    const state = setupFind([stored]);
    const filters = { searchQuery: 'Saga', ownerId: 'filtered-owner', isPublic: false };
    const result = await state.useCase.execute({ ...findInput, filters });
    expect(state.findWithFilters.mock.calls).toStrictEqual([
      [{ searchQuery: 'Saga', ownerId: 'filtered-owner', isPublic: true }],
    ]);
    expect(state.videos.getPlaylistVideos).toHaveBeenCalledExactlyOnceWith(itemsFor(stored), {
      type: 'public_only',
    });
    expect(result).toMatchObject({
      ok: true,
      data: { filters: { searchQuery: 'Saga', ownerId: 'filtered-owner', isPublic: true } },
    });
    expect(filters.isPublic).toBe(false);
  });

  test('sorts before selecting the last full page and disables further paging at the exact end', async () => {
    const state = setupFind(
      ['D', 'A', 'C', 'B'].map((name) => playlist(name, { name, videoIds: [] })),
    );
    await expect(
      state.useCase.execute({ ...findInput, limit: 2, offset: 2 }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        playlists: [{ id: 'C' }, { id: 'D' }],
        totalCount: 4,
        hasMore: false,
        pagination: { currentPage: 2, limit: 2, offset: 2, totalPages: 2 },
      },
    });
  });

  test('returns no page entries after the end instead of wrapping or repeating earlier playlists', async () => {
    const state = setupFind([playlist('A'), playlist('B')]);
    await expect(
      state.useCase.execute({ ...findInput, limit: 2, offset: 4 }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        playlists: [],
        totalCount: 2,
        hasMore: false,
        pagination: { currentPage: 3, totalPages: 1 },
      },
    });
  });

  test.each(['lookup', 'items', 'catalog'] as const)(
    'returns a query failure, not a partial catalog, after %s rejection',
    async (stage) => {
      const state = setupFind();
      if (stage === 'lookup') {
        state.findWithFilters.mockRejectedValueOnce(new Error('lookup unavailable'));
      }
      if (stage === 'items') {
        state.getPlaylistItems.mockRejectedValueOnce(new Error('items unavailable'));
      }
      if (stage === 'catalog') {
        state.videos.getPlaylistVideos.mockRejectedValueOnce(new Error('catalog unavailable'));
      }
      const result = await state.useCase.execute(findInput);
      expect(result).toMatchObject({ ok: false, reason: 'PLAYLIST_QUERY_UNAVAILABLE' });
      expect(result).not.toHaveProperty('data');
    },
  );
});

describe('playlist detail query boundaries', () => {
  test.each(['', ' \t\n '])(
    'rejects blank playlist identifier %j before I/O',
    async (playlistId) => {
      const state = setupDetails();
      await expect(state.useCase.execute({ ...detailsInput, playlistId })).resolves.toMatchObject({
        ok: false,
        reason: 'VALIDATION_ERROR',
      });
      expect(state.findById).not.toHaveBeenCalled();
      expect(state.getPlaylistItems).not.toHaveBeenCalled();
      expect(state.videos.getPlaylistVideos).not.toHaveBeenCalled();
      expect(state.findBySeries).not.toHaveBeenCalled();
    },
  );

  test.each(invalidPagination)(
    'rejects $label before loading even metadata-only details',
    async ({ limit, offset }) => {
      const state = setupDetails();
      await expect(
        state.useCase.execute({
          ...detailsInput,
          includeVideos: false,
          videoLimit: limit,
          videoOffset: offset,
        }),
      ).resolves.toMatchObject({ ok: false, reason: 'VALIDATION_ERROR' });
      expect(state.findById).not.toHaveBeenCalled();
      expect(state.getPlaylistItems).not.toHaveBeenCalled();
      expect(state.findBySeries).not.toHaveBeenCalled();
      expect(state.videos.getPlaylistVideos).not.toHaveBeenCalled();
    },
  );

  test.each([1, 100])(
    'accepts detail limit %i and exposes only catalog-visible video ids',
    async (videoLimit) => {
      const state = setupDetails();
      await expect(state.useCase.execute({ ...detailsInput, videoLimit })).resolves.toMatchObject({
        ok: true,
        data: {
          playlist: { videoIds: ['visible-1', 'visible-2'] },
          videoPagination: { limit: videoLimit, total: 2 },
        },
      });
      expect(state.videos.getPlaylistVideos).toHaveBeenCalledExactlyOnceWith(
        itemsFor(playlist('playlist-current')),
        { type: 'public_only' },
      );
    },
  );

  test('returns the final visible video and no-more flag when the page ends exactly at the visible total', async () => {
    const state = setupDetails();
    const result = await state.useCase.execute({ ...detailsInput, videoLimit: 1, videoOffset: 1 });
    expect(result).toMatchObject({
      ok: true,
      data: {
        playlist: { videoIds: ['visible-1', 'visible-2'], videos: [{ id: 'visible-2' }] },
        videoPagination: { total: 2, offset: 1, limit: 1, hasMore: false },
      },
    });
    expect(JSON.stringify(result)).not.toContain('hidden-secret');
  });

  test('metadata-only mode still resolves visible queue ids but omits video details, pagination and unrelated series reads', async () => {
    const state = setupDetails();
    await expect(
      state.useCase.execute({ ...detailsInput, includeVideos: false }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        playlist: { videoIds: ['visible-1', 'visible-2'], videos: [] },
        videoPagination: null,
        relatedPlaylists: undefined,
      },
    });
    expect(state.videos.getPlaylistVideos).toHaveBeenCalledTimes(1);
    expect(state.findBySeries).not.toHaveBeenCalled();
  });

  test.each([undefined, 'different-owner'])(
    'does not read items or related records for an inaccessible private playlist viewed by %s',
    async (ownerId) => {
      const state = setupDetails(playlist('playlist-current', { isPublic: false }));
      await expect(
        state.useCase.execute({ ...detailsInput, ownerId, includeRelated: true }),
      ).resolves.toMatchObject({ ok: false, reason: 'PLAYLIST_NOT_FOUND' });
      expect(state.getPlaylistItems).not.toHaveBeenCalled();
      expect(state.videos.getPlaylistVideos).not.toHaveBeenCalled();
      expect(state.findBySeries).not.toHaveBeenCalled();
    },
  );

  test('distinguishes a public parent from an owned sibling and does not read hidden related playlists or count their hidden videos', async () => {
    const current = playlist('playlist-current');
    const parent = playlist('series-parent', {
      type: 'series',
      ownerId: 'other-owner',
      videoIds: ['parent-video', 'hidden-parent'],
    });
    const sibling = playlist('season-sibling', {
      type: 'season',
      isPublic: false,
      videoIds: ['sibling-video', 'hidden-sibling'],
    });
    const hidden = playlist('private-related', { isPublic: false, ownerId: 'other-owner' });
    const state = setupDetails(current, [current, parent, sibling, hidden]);
    const result = await state.useCase.execute({
      ...detailsInput,
      ownerId: 'owner-1',
      includeRelated: true,
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        relatedPlaylists: [
          { id: 'series-parent', relationship: 'parent', videoCount: 1 },
          { id: 'season-sibling', relationship: 'sibling', videoCount: 1 },
        ],
      },
    });
    expect(state.findBySeries).toHaveBeenCalledExactlyOnceWith('Saga');
    expect(state.getPlaylistItems.mock.calls).toStrictEqual([
      ['playlist-current'],
      ['series-parent'],
      ['season-sibling'],
    ]);
    expect(state.videos.getPlaylistVideos.mock.calls.map(([, scope]) => scope)).toStrictEqual(
      Array.from({ length: 3 }, () => ({ type: 'public_or_owned', ownerId: 'owner-1' })),
    );
    expect(JSON.stringify(result)).not.toContain('private-related');
    expect(JSON.stringify(result)).not.toContain('hidden-');
  });

  test.each(['lookup', 'items', 'catalog', 'related lookup'] as const)(
    'reports a complete query failure after %s rejection',
    async (stage) => {
      const state = setupDetails();
      if (stage === 'lookup') {
        state.findById.mockRejectedValueOnce(new Error('lookup unavailable'));
      }
      if (stage === 'items') {
        state.getPlaylistItems.mockRejectedValueOnce(new Error('items unavailable'));
      }
      if (stage === 'catalog') {
        state.videos.getPlaylistVideos.mockRejectedValueOnce(new Error('catalog unavailable'));
      }
      if (stage === 'related lookup') {
        state.findBySeries.mockRejectedValueOnce(new Error('series unavailable'));
      }
      const result = await state.useCase.execute({ ...detailsInput, includeRelated: true });
      expect(result).toMatchObject({ ok: false, reason: 'PLAYLIST_QUERY_UNAVAILABLE' });
      expect(result).not.toHaveProperty('data');
    },
  );
});
