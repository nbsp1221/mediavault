import type { VideoViewer } from '~/modules/library/domain/policies/video-access.policy';
import type { PlaylistRepositoryPort } from '~/modules/playlist/application/ports/playlist-repository.port';
import type { PlaylistVideoCatalogPort } from '~/modules/playlist/application/ports/playlist-video-catalog.port';
import {
  type AddVideoToPlaylistInput,
  AddVideoToPlaylistUseCase,
} from '~/modules/playlist/application/use-cases/add-video-to-playlist.usecase';
import {
  type CreatePlaylistInput,
  CreatePlaylistUseCase,
} from '~/modules/playlist/application/use-cases/create-playlist.usecase';
import {
  type DeletePlaylistInput,
  DeletePlaylistUseCase,
} from '~/modules/playlist/application/use-cases/delete-playlist.usecase';
import {
  type FindPlaylistsInput,
  FindPlaylistsUseCase,
} from '~/modules/playlist/application/use-cases/find-playlists.usecase';
import {
  type GetPlaylistDetailsInput,
  GetPlaylistDetailsUseCase,
} from '~/modules/playlist/application/use-cases/get-playlist-details.usecase';
import {
  type RemoveVideoFromPlaylistInput,
  RemoveVideoFromPlaylistUseCase,
} from '~/modules/playlist/application/use-cases/remove-video-from-playlist.usecase';
import {
  type ReorderPlaylistItemsInput,
  ReorderPlaylistItemsUseCase,
} from '~/modules/playlist/application/use-cases/reorder-playlist-items.usecase';
import {
  type UpdatePlaylistInput,
  UpdatePlaylistUseCase,
} from '~/modules/playlist/application/use-cases/update-playlist.usecase';
import { SqlitePlaylistRepository } from '~/modules/playlist/infrastructure/sqlite/sqlite-playlist.repository';
import { SqlitePlaylistVideoCatalog } from '~/modules/playlist/infrastructure/video/sqlite-playlist-video-catalog.adapter';

export type PlaylistFailure = { error: string; success: false; reason: string; status: number };
export type PlaylistSuccess<T> = { data: T; success: true };
export type PlaylistResult<T> = PlaylistFailure | PlaylistSuccess<T>;

export interface PlaylistPlaybackQueue {
  id: string;
  name: string;
  videoIds: string[];
}

interface Dependencies {
  playlistRepository: PlaylistRepositoryPort;
  videoCatalog: PlaylistVideoCatalogPort;
}

function toPlaylistResult<T>(
  result: { ok: true; data: T } | { ok: false; reason: string; message: string },
): PlaylistResult<T> {
  if (result.ok) {
    return { success: true, data: result.data };
  }
  const status =
    result.reason === 'PLAYLIST_NOT_FOUND' || result.reason === 'VIDEO_NOT_FOUND_IN_PLAYLIST'
      ? 404
      : result.reason === 'PLAYLIST_PERMISSION_DENIED'
        ? 403
        : result.reason.startsWith('DUPLICATE_')
          ? 409
          : result.reason === 'PLAYLIST_QUERY_UNAVAILABLE'
            ? 503
            : result.reason === 'PLAYLIST_MUTATION_FAILED'
              ? 500
              : 400;
  return { success: false, error: result.message, reason: result.reason, status };
}

/** Assemble playlist use cases without duplicating their application contracts. */
export function createServerPlaylistServices(overrides: Partial<Dependencies> = {}) {
  const playlistRepository = overrides.playlistRepository ?? new SqlitePlaylistRepository();
  const videoCatalog = overrides.videoCatalog ?? new SqlitePlaylistVideoCatalog();
  const add = new AddVideoToPlaylistUseCase({ playlistRepository, videoCatalog });
  const create = new CreatePlaylistUseCase({ playlistRepository, videoCatalog });
  const remove = new RemoveVideoFromPlaylistUseCase({ playlistRepository });
  const destroy = new DeletePlaylistUseCase({ playlistRepository });
  const find = new FindPlaylistsUseCase({ playlistRepository, videoCatalog });
  const details = new GetPlaylistDetailsUseCase({ playlistRepository, videoCatalog });
  const reorder = new ReorderPlaylistItemsUseCase({ playlistRepository, videoCatalog });
  const update = new UpdatePlaylistUseCase({ playlistRepository });
  return {
    addVideoToPlaylist: {
      execute: async (input: AddVideoToPlaylistInput) => toPlaylistResult(await add.execute(input)),
    },
    createPlaylist: {
      execute: async (input: CreatePlaylistInput) => toPlaylistResult(await create.execute(input)),
    },
    deletePlaylist: {
      execute: async (input: DeletePlaylistInput) => toPlaylistResult(await destroy.execute(input)),
    },
    findPlaylists: {
      execute: async (input: FindPlaylistsInput) => toPlaylistResult(await find.execute(input)),
    },
    getPlaylistDetails: {
      execute: async (input: GetPlaylistDetailsInput) =>
        toPlaylistResult(await details.execute(input)),
    },
    removeVideoFromPlaylist: {
      execute: async (input: RemoveVideoFromPlaylistInput) =>
        toPlaylistResult(await remove.execute(input)),
    },
    reorderPlaylistItems: {
      execute: async (input: ReorderPlaylistItemsInput) =>
        toPlaylistResult(await reorder.execute(input)),
    },
    updatePlaylist: {
      execute: async (input: UpdatePlaylistInput) => toPlaylistResult(await update.execute(input)),
    },
  };
}

export type ServerPlaylistServices = ReturnType<typeof createServerPlaylistServices>;

let cachedPlaylistServices: ServerPlaylistServices | null = null;

export function getServerPlaylistServices(): ServerPlaylistServices {
  cachedPlaylistServices ??= createServerPlaylistServices();
  return cachedPlaylistServices;
}

/** Resolve the complete ordered queue; membership never grants video access. */
export async function loadPlaylistPlaybackQueue(input: {
  playlistId: string;
  viewer: VideoViewer;
}): Promise<PlaylistResult<PlaylistPlaybackQueue>> {
  const result = await getServerPlaylistServices().getPlaylistDetails.execute({
    includeRelated: false,
    includeVideos: false,
    ownerId: input.viewer.type === 'authenticated' ? input.viewer.userId : undefined,
    playlistId: input.playlistId,
    videoLimit: 1,
    videoOffset: 0,
  });
  if (!result.success) {
    return result;
  }
  return {
    success: true,
    data: {
      id: result.data.playlist.id,
      name: result.data.playlist.name,
      videoIds: result.data.playlist.videoIds,
    },
  };
}
