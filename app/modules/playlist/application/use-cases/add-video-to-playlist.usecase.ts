import { createVideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { PlaylistItem } from '../../domain/playlist';
import type { PlaylistRepositoryPort } from '../ports/playlist-repository.port';
import type { PlaylistVideoCatalogPort } from '../ports/playlist-video-catalog.port';

export interface AddVideoToPlaylistInput {
  episodeMetadata?: PlaylistItem['episodeMetadata'];
  ownerId: string;
  playlistId: string;
  position?: number;
  videoId: string;
}

export interface AddVideoToPlaylistOutput {
  finalPosition: number;
  message: string;
  playlistName: string;
  totalVideosInPlaylist: number;
  videoTitle: string;
}

export type AddVideoToPlaylistUseCaseResult =
  | {
    ok: true;
    data: AddVideoToPlaylistOutput;
  }
  | {
    ok: false;
    message: string;
    reason:
      | 'DUPLICATE_VIDEO_IN_PLAYLIST'
      | 'INVALID_PLAYLIST_POSITION'
      | 'PLAYLIST_MUTATION_FAILED'
      | 'PLAYLIST_NOT_FOUND'
      | 'PLAYLIST_PERMISSION_DENIED'
      | 'VIDEO_NOT_FOUND';
  };

interface AddVideoToPlaylistUseCaseDependencies {
  playlistRepository: Pick<PlaylistRepositoryPort, 'addVideoToPlaylist' | 'findById'>;
  videoCatalog: Pick<PlaylistVideoCatalogPort, 'findById'>;
}

export class AddVideoToPlaylistUseCase {
  constructor(
    private readonly deps: AddVideoToPlaylistUseCaseDependencies,
  ) {}

  async execute(input: AddVideoToPlaylistInput): Promise<AddVideoToPlaylistUseCaseResult> {
    try {
      const playlist = await this.deps.playlistRepository.findById(input.playlistId);

      if (!playlist) {
        return {
          message: `Playlist with ID "${input.playlistId}" not found`,
          ok: false,
          reason: 'PLAYLIST_NOT_FOUND',
        };
      }

      if (playlist.ownerId !== input.ownerId) {
        return {
          message: `User "${input.ownerId}" does not have permission to add video to playlist "${input.playlistId}"`,
          ok: false,
          reason: 'PLAYLIST_PERMISSION_DENIED',
        };
      }

      if (playlist.videoIds.includes(input.videoId)) {
        return {
          message: `Video "${input.videoId}" is already in playlist "${input.playlistId}"`,
          ok: false,
          reason: 'DUPLICATE_VIDEO_IN_PLAYLIST',
        };
      }

      const video = await this.deps.videoCatalog.findById(input.videoId, createVideoReadAccessScope({
        type: 'authenticated',
        userId: input.ownerId,
      }));
      if (!video) {
        return {
          message: `Video with ID "${input.videoId}" not found`,
          ok: false,
          reason: 'VIDEO_NOT_FOUND',
        };
      }

      const position = input.position ?? playlist.videoIds.length;
      if (!Number.isInteger(position) || position < 0 || position > playlist.videoIds.length) {
        return {
          message: `Invalid position ${position}. Must be between 0 and ${playlist.videoIds.length}`,
          ok: false,
          reason: 'INVALID_PLAYLIST_POSITION',
        };
      }

      await this.deps.playlistRepository.addVideoToPlaylist(
        input.playlistId,
        input.videoId,
        position,
        input.episodeMetadata,
      );
      const updated = await this.deps.playlistRepository.findById(input.playlistId);

      return {
        ok: true,
        data: {
          finalPosition: position,
          message: `Video "${video.title}" added to playlist "${playlist.name}" successfully`,
          playlistName: playlist.name,
          totalVideosInPlaylist: updated?.videoIds.length ?? playlist.videoIds.length + 1,
          videoTitle: video.title,
        },
      };
    }
    catch {
      return {
        message: 'Failed to add video to playlist',
        ok: false,
        reason: 'PLAYLIST_MUTATION_FAILED',
      };
    }
  }
}
