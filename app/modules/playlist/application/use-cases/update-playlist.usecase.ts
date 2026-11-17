import type { Playlist, UpdatePlaylistRequest } from '../../domain/playlist';
import type { PlaylistRepositoryPort } from '../ports/playlist-repository.port';
import { PlaylistAccessPolicy } from '../../domain/policies/playlist-access.policy';

export interface UpdatePlaylistInput extends UpdatePlaylistRequest {
  ownerId: string;
  playlistId: string;
}

export interface UpdatePlaylistOutput {
  fieldsUpdated: string[];
  message: string;
  playlist: Playlist;
}

export type UpdatePlaylistUseCaseResult =
  | {
      ok: true;
      data: UpdatePlaylistOutput;
    }
  | {
      ok: false;
      message: string;
      reason:
        | 'DUPLICATE_PLAYLIST_NAME'
        | 'INVALID_PLAYLIST_DATA'
        | 'PLAYLIST_MUTATION_FAILED'
        | 'PLAYLIST_NOT_FOUND'
        | 'PLAYLIST_PERMISSION_DENIED'
        | 'VALIDATION_ERROR';
    };

interface UpdatePlaylistUseCaseDependencies {
  playlistRepository: Pick<PlaylistRepositoryPort, 'findById' | 'nameExistsForOwner' | 'update'>;
}

function validateUpdateRequest(
  input: UpdatePlaylistRequest,
  normalizedName: string | undefined,
): UpdatePlaylistUseCaseResult | null {
  const hasUpdates =
    input.name !== undefined ||
    input.description !== undefined ||
    input.isPublic !== undefined ||
    input.metadata !== undefined;

  if (!hasUpdates) {
    return {
      message: 'At least one field must be provided for update',
      ok: false,
      reason: 'VALIDATION_ERROR',
    };
  }

  if (input.name !== undefined && !normalizedName) {
    return {
      message: 'Invalid playlist name: cannot be empty',
      ok: false,
      reason: 'INVALID_PLAYLIST_DATA',
    };
  }

  if (normalizedName && normalizedName.length > 255) {
    return {
      message: 'Invalid playlist name: cannot exceed 255 characters',
      ok: false,
      reason: 'INVALID_PLAYLIST_DATA',
    };
  }

  if (input.description && input.description.trim().length > 1000) {
    return {
      message: 'Invalid playlist description: cannot exceed 1000 characters',
      ok: false,
      reason: 'INVALID_PLAYLIST_DATA',
    };
  }

  return null;
}

export class UpdatePlaylistUseCase {
  constructor(private readonly deps: UpdatePlaylistUseCaseDependencies) {}

  async execute(input: UpdatePlaylistInput): Promise<UpdatePlaylistUseCaseResult> {
    const normalizedName = input.name?.trim();
    const validationFailure = validateUpdateRequest(input, normalizedName);
    if (validationFailure) {
      return validationFailure;
    }

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
          message: `User "${input.ownerId}" does not have permission to update playlist "${input.playlistId}"`,
          ok: false,
          reason: 'PLAYLIST_PERMISSION_DENIED',
        };
      }

      if (normalizedName !== undefined && normalizedName !== playlist.name) {
        const nameExists = await this.deps.playlistRepository.nameExistsForOwner(
          normalizedName,
          input.ownerId,
          playlist.id,
        );
        if (nameExists) {
          return {
            message: `Playlist with name "${normalizedName}" already exists for user "${input.ownerId}"`,
            ok: false,
            reason: 'DUPLICATE_PLAYLIST_NAME',
          };
        }
      }

      const fieldsUpdated: string[] = [];
      const updates: UpdatePlaylistRequest = {};

      if (normalizedName !== undefined && normalizedName !== playlist.name) {
        updates.name = normalizedName;
        fieldsUpdated.push('name');
      }

      if (input.description !== undefined && input.description !== playlist.description) {
        updates.description = input.description.trim() || undefined;
        fieldsUpdated.push('description');
      }

      if (input.isPublic !== undefined && input.isPublic !== playlist.isPublic) {
        updates.isPublic = input.isPublic;
        fieldsUpdated.push('isPublic');
      }

      if (input.metadata !== undefined) {
        updates.metadata = {
          ...playlist.metadata,
          ...input.metadata,
        };
        fieldsUpdated.push('metadata');
      }

      if (fieldsUpdated.length === 0) {
        return {
          ok: true,
          data: {
            fieldsUpdated,
            message: 'No changes were made to the playlist',
            playlist,
          },
        };
      }

      const updated = await this.deps.playlistRepository.update(input.playlistId, updates);

      if (!updated) {
        return {
          message: 'Failed to update playlist',
          ok: false,
          reason: 'PLAYLIST_MUTATION_FAILED',
        };
      }

      return {
        ok: true,
        data: {
          fieldsUpdated,
          message: `Playlist "${updated.name}" updated successfully`,
          playlist: updated,
        },
      };
    } catch {
      return {
        message: 'Failed to update playlist',
        ok: false,
        reason: 'PLAYLIST_MUTATION_FAILED',
      };
    }
  }
}
