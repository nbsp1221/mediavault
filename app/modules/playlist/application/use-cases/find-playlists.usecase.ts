import { createVideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { Playlist, PlaylistFilters, PlaylistStats } from '../../domain/playlist';
import type { PlaylistSortField, PlaylistSortOrder } from '../../domain/playlist-sorting';
import type { PlaylistRepositoryPort } from '../ports/playlist-repository.port';
import type { PlaylistVideoCatalogPort } from '../ports/playlist-video-catalog.port';
import { sortPlaylists } from '../../domain/playlist-sorting';
import { PlaylistAccessPolicy } from '../../domain/policies/playlist-access.policy';
import { PlaylistStatsPolicy } from '../../domain/policies/playlist-stats.policy';

export interface FindPlaylistsInput {
  filters: PlaylistFilters;
  includeEmpty: boolean;
  includeStats: boolean;
  limit: number;
  offset: number;
  ownerId?: string;
  sortBy: PlaylistSortField;
  sortOrder: PlaylistSortOrder;
}

export interface FindPlaylistsOutput {
  filters: PlaylistFilters;
  hasMore: boolean;
  pagination: {
    currentPage: number;
    limit: number;
    offset: number;
    totalPages: number;
  };
  playlists: Playlist[];
  stats?: PlaylistStats[];
  totalCount: number;
}

export type FindPlaylistsUseCaseResult =
  | {
    ok: true;
    data: FindPlaylistsOutput;
  }
  | {
    ok: false;
    message: string;
    reason: 'PLAYLIST_QUERY_UNAVAILABLE' | 'VALIDATION_ERROR';
  };

interface FindPlaylistsUseCaseDependencies {
  playlistRepository: Pick<PlaylistRepositoryPort, 'findWithFilters' | 'getPlaylistItems'>;
  videoCatalog: PlaylistVideoCatalogPort;
}

function isIntegerInRange(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum;
}

function isNonNegativeInteger(value: number) {
  return Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0;
}

function createScopedPlaylistStats(playlist: Playlist): PlaylistStats {
  return PlaylistStatsPolicy.build(playlist);
}

export class FindPlaylistsUseCase {
  constructor(
    private readonly deps: FindPlaylistsUseCaseDependencies,
  ) {}

  async execute(input: FindPlaylistsInput): Promise<FindPlaylistsUseCaseResult> {
    if (!isIntegerInRange(input.limit, 1, 100)) {
      return {
        message: 'Limit must be an integer between 1 and 100',
        ok: false,
        reason: 'VALIDATION_ERROR',
      };
    }

    if (!isNonNegativeInteger(input.offset)) {
      return {
        message: 'Offset must be a non-negative integer',
        ok: false,
        reason: 'VALIDATION_ERROR',
      };
    }

    try {
      const filters = !input.ownerId
        ? { ...input.filters, isPublic: true }
        : { ...input.filters };
      const allPlaylists = await this.deps.playlistRepository.findWithFilters(filters);
      const accessiblePlaylists = allPlaylists.filter(playlist => PlaylistAccessPolicy.canAccess({
        ownerId: input.ownerId,
        playlist,
      }));
      const readScope = createVideoReadAccessScope(
        input.ownerId
          ? { type: 'authenticated', userId: input.ownerId }
          : { type: 'anonymous' },
      );
      const scopedPlaylists = [];

      for (const playlist of accessiblePlaylists) {
        const playlistItems = await this.deps.playlistRepository.getPlaylistItems(playlist.id);
        const videos = await this.deps.videoCatalog.getPlaylistVideos(playlistItems, readScope);
        scopedPlaylists.push({
          ...playlist,
          videoIds: videos.map(video => video.id),
        });
      }

      const visiblePlaylists = input.includeEmpty
        ? scopedPlaylists
        : scopedPlaylists.filter(playlist => playlist.videoIds.length > 0);
      const sortedPlaylists = sortPlaylists(visiblePlaylists, {
        sortBy: input.sortBy,
        sortOrder: input.sortOrder,
      });
      const totalCount = sortedPlaylists.length;
      const playlists = sortedPlaylists.slice(input.offset, input.offset + input.limit);

      return {
        ok: true,
        data: {
          filters,
          hasMore: input.offset + input.limit < totalCount,
          pagination: {
            currentPage: Math.floor(input.offset / input.limit) + 1,
            limit: input.limit,
            offset: input.offset,
            totalPages: Math.ceil(totalCount / input.limit),
          },
          playlists,
          stats: input.includeStats
            ? playlists.map(createScopedPlaylistStats)
            : undefined,
          totalCount,
        },
      };
    }
    catch {
      return {
        message: 'Failed to load playlists',
        ok: false,
        reason: 'PLAYLIST_QUERY_UNAVAILABLE',
      };
    }
  }
}
