import { createVideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { PlaylistRepositoryPort } from '../ports/playlist-repository.port';
import type { PlaylistVideoCatalogPort } from '../ports/playlist-video-catalog.port';
import { PlaylistAccessPolicy } from '../../domain/policies/playlist-access.policy';

export interface ReorderPlaylistItemsInput {
  newOrder: string[];
  ownerId: string;
  playlistId: string;
}

export interface ReorderPlaylistItemsOutput {
  message: string;
  newOrder: string[];
  oldOrder: string[];
  playlistName: string;
  videosReordered: number;
}

export type ReorderPlaylistItemsUseCaseResult =
  | { ok: true; data: ReorderPlaylistItemsOutput }
  | {
      ok: false;
      message: string;
      reason:
        | 'PLAYLIST_MUTATION_FAILED'
        | 'PLAYLIST_NOT_FOUND'
        | 'PLAYLIST_PERMISSION_DENIED'
        | 'PLAYLIST_REORDER_ERROR'
        | 'VALIDATION_ERROR';
    };

interface Dependencies {
  playlistRepository: Pick<
    PlaylistRepositoryPort,
    'findById' | 'getPlaylistItems' | 'reorderPlaylistItems'
  >;
  videoCatalog: Pick<PlaylistVideoCatalogPort, 'getPlaylistVideos'>;
}

/** Reorder only accessible items while preserving hidden videos without disclosing their identities. */
export class ReorderPlaylistItemsUseCase {
  constructor(private readonly deps: Dependencies) {}

  async execute(input: ReorderPlaylistItemsInput): Promise<ReorderPlaylistItemsUseCaseResult> {
    try {
      const playlist = await this.deps.playlistRepository.findById(input.playlistId);
      if (!playlist) {
        return { ok: false, reason: 'PLAYLIST_NOT_FOUND', message: 'Playlist not found' };
      }
      if (!PlaylistAccessPolicy.canManage({ ownerId: input.ownerId, playlist })) {
        return {
          ok: false,
          reason: 'PLAYLIST_PERMISSION_DENIED',
          message: 'Playlist cannot be changed by this viewer',
        };
      }
      if (
        !Array.isArray(input.newOrder) ||
        input.newOrder.length === 0 ||
        input.newOrder.some((id) => typeof id !== 'string' || !id)
      ) {
        return { ok: false, reason: 'VALIDATION_ERROR', message: 'New order cannot be empty' };
      }
      const items = await this.deps.playlistRepository.getPlaylistItems(playlist.id);
      const visible = await this.deps.videoCatalog.getPlaylistVideos(
        items,
        createVideoReadAccessScope({ type: 'authenticated', userId: input.ownerId }),
      );
      const oldOrder = visible.map((video) => video.id);
      const current = new Set(oldOrder);
      const next = new Set(input.newOrder);
      if (
        next.size !== input.newOrder.length ||
        input.newOrder.length !== oldOrder.length ||
        [...current].some((id) => !next.has(id))
      ) {
        return {
          ok: false,
          reason: 'PLAYLIST_REORDER_ERROR',
          message: 'New order must contain exactly the same accessible videos as current playlist',
        };
      }
      let index = 0;
      const fullOrder = playlist.videoIds.map((id) =>
        current.has(id) ? input.newOrder[index++] : id,
      );
      await this.deps.playlistRepository.reorderPlaylistItems(playlist.id, fullOrder);
      return {
        ok: true,
        data: {
          message: 'Playlist reordered successfully',
          newOrder: input.newOrder,
          oldOrder,
          playlistName: playlist.name,
          videosReordered: oldOrder.length,
        },
      };
    } catch {
      return {
        ok: false,
        reason: 'PLAYLIST_MUTATION_FAILED',
        message: 'Failed to reorder playlist',
      };
    }
  }
}
