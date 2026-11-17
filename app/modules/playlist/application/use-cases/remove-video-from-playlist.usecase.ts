import type { PlaylistRepositoryPort } from '../ports/playlist-repository.port';
import { PlaylistAccessPolicy } from '../../domain/policies/playlist-access.policy';

export interface RemoveVideoFromPlaylistInput {
  ownerId: string;
  playlistId: string;
  videoId: string;
}

export interface RemoveVideoFromPlaylistOutput {
  message: string;
  playlistId: string;
  remainingVideos: number;
  videoId: string;
}

export type RemoveVideoFromPlaylistUseCaseResult =
  | {
      ok: true;
      data: RemoveVideoFromPlaylistOutput;
    }
  | {
      ok: false;
      message: string;
      reason:
        | 'PLAYLIST_MUTATION_FAILED'
        | 'PLAYLIST_NOT_FOUND'
        | 'PLAYLIST_PERMISSION_DENIED'
        | 'VIDEO_NOT_FOUND_IN_PLAYLIST';
    };

interface RemoveVideoFromPlaylistUseCaseDependencies {
  playlistRepository: Pick<PlaylistRepositoryPort, 'findById' | 'removeVideoFromPlaylist'>;
}

export class RemoveVideoFromPlaylistUseCase {
  constructor(private readonly deps: RemoveVideoFromPlaylistUseCaseDependencies) {}

  async execute(
    input: RemoveVideoFromPlaylistInput,
  ): Promise<RemoveVideoFromPlaylistUseCaseResult> {
    try {
      const playlist = await this.deps.playlistRepository.findById(input.playlistId);

      if (!playlist) {
        return {
          message: `Playlist with ID "${input.playlistId}" not found`,
          ok: false,
          reason: 'PLAYLIST_NOT_FOUND',
        };
      }

      if (!PlaylistAccessPolicy.canManage({ ownerId: input.ownerId, playlist })) {
        return {
          message: `User "${input.ownerId}" does not have permission to modify playlist "${input.playlistId}"`,
          ok: false,
          reason: 'PLAYLIST_PERMISSION_DENIED',
        };
      }

      if (!playlist.videoIds.includes(input.videoId)) {
        return {
          message: `Video "${input.videoId}" not found in playlist "${input.playlistId}"`,
          ok: false,
          reason: 'VIDEO_NOT_FOUND_IN_PLAYLIST',
        };
      }

      await this.deps.playlistRepository.removeVideoFromPlaylist(input.playlistId, input.videoId);
      const updated = await this.deps.playlistRepository.findById(input.playlistId);

      return {
        ok: true,
        data: {
          message: `Video removed from playlist "${playlist.name}" successfully`,
          playlistId: input.playlistId,
          remainingVideos: updated?.videoIds.length ?? Math.max(playlist.videoIds.length - 1, 0),
          videoId: input.videoId,
        },
      };
    } catch {
      return {
        message: 'Failed to remove video from playlist',
        ok: false,
        reason: 'PLAYLIST_MUTATION_FAILED',
      };
    }
  }
}
