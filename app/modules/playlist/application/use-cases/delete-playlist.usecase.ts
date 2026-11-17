import type { PlaylistRepositoryPort } from '../ports/playlist-repository.port';
import { PlaylistAccessPolicy } from '../../domain/policies/playlist-access.policy';

export interface DeletePlaylistInput {
  ownerId: string;
  playlistId: string;
}

export interface DeletePlaylistOutput {
  deletedPlaylistName: string;
  message: string;
}

export type DeletePlaylistUseCaseResult =
  | {
      ok: true;
      data: DeletePlaylistOutput;
    }
  | {
      ok: false;
      message: string;
      reason: 'PLAYLIST_MUTATION_FAILED' | 'PLAYLIST_NOT_FOUND' | 'PLAYLIST_PERMISSION_DENIED';
    };

interface DeletePlaylistUseCaseDependencies {
  playlistRepository: Pick<PlaylistRepositoryPort, 'delete' | 'findById'>;
}

export class DeletePlaylistUseCase {
  constructor(private readonly deps: DeletePlaylistUseCaseDependencies) {}

  async execute(input: DeletePlaylistInput): Promise<DeletePlaylistUseCaseResult> {
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
          message: `User "${input.ownerId}" does not have permission to delete playlist "${input.playlistId}"`,
          ok: false,
          reason: 'PLAYLIST_PERMISSION_DENIED',
        };
      }

      const deleted = await this.deps.playlistRepository.delete(playlist.id);

      if (!deleted) {
        return {
          message: 'Failed to delete playlist',
          ok: false,
          reason: 'PLAYLIST_MUTATION_FAILED',
        };
      }

      return {
        ok: true,
        data: {
          deletedPlaylistName: playlist.name,
          message: `Playlist "${playlist.name}" deleted successfully`,
        },
      };
    } catch {
      return {
        message: 'Failed to delete playlist',
        ok: false,
        reason: 'PLAYLIST_MUTATION_FAILED',
      };
    }
  }
}
