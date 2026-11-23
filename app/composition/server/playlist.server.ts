import type { VideoViewer } from '~/modules/library/domain/policies/video-access.policy';
import type { PlaylistRepositoryPort } from '~/modules/playlist/application/ports/playlist-repository.port';
import type { PlaylistVideoCatalogPort } from '~/modules/playlist/application/ports/playlist-video-catalog.port';
import type { GetPlaylistDetailsUseCaseResult } from '~/modules/playlist/application/use-cases/get-playlist-details.usecase';
import { SqliteReadyVideoCatalogAdapter } from '~/modules/library/infrastructure/sqlite/sqlite-ready-video-catalog.adapter';
import { AddVideoToPlaylistUseCase } from '~/modules/playlist/application/use-cases/add-video-to-playlist.usecase';
import { CreatePlaylistUseCase } from '~/modules/playlist/application/use-cases/create-playlist.usecase';
import { DeletePlaylistUseCase } from '~/modules/playlist/application/use-cases/delete-playlist.usecase';
import { FindPlaylistsUseCase } from '~/modules/playlist/application/use-cases/find-playlists.usecase';
import { GetPlaylistDetailsUseCase } from '~/modules/playlist/application/use-cases/get-playlist-details.usecase';
import { RemoveVideoFromPlaylistUseCase } from '~/modules/playlist/application/use-cases/remove-video-from-playlist.usecase';
import { ReorderPlaylistItemsUseCase } from '~/modules/playlist/application/use-cases/reorder-playlist-items.usecase';
import { UpdatePlaylistUseCase } from '~/modules/playlist/application/use-cases/update-playlist.usecase';
import { SqlitePlaylistRepository } from '~/modules/playlist/infrastructure/sqlite/sqlite-playlist.repository';
import { PlaylistVideoCatalogAdapter } from './playlist-video-catalog.adapter.server';

export interface PlaylistPlaybackQueue {
  id: string;
  name: string;
  videoIds: string[];
}

interface Dependencies {
  playlistRepository: PlaylistRepositoryPort;
  videoCatalog: PlaylistVideoCatalogPort;
}

/** Assemble playlist use cases without duplicating their application contracts. */
export function createServerPlaylistServices(overrides: Partial<Dependencies> = {}) {
  const playlistRepository = overrides.playlistRepository ?? new SqlitePlaylistRepository();
  const videoCatalog =
    overrides.videoCatalog ??
    new PlaylistVideoCatalogAdapter({ catalog: new SqliteReadyVideoCatalogAdapter() });
  return {
    addVideoToPlaylist: new AddVideoToPlaylistUseCase({ playlistRepository, videoCatalog }),
    createPlaylist: new CreatePlaylistUseCase({ playlistRepository, videoCatalog }),
    deletePlaylist: new DeletePlaylistUseCase({ playlistRepository }),
    findPlaylists: new FindPlaylistsUseCase({ playlistRepository, videoCatalog }),
    getPlaylistDetails: new GetPlaylistDetailsUseCase({ playlistRepository, videoCatalog }),
    removeVideoFromPlaylist: new RemoveVideoFromPlaylistUseCase({ playlistRepository }),
    reorderPlaylistItems: new ReorderPlaylistItemsUseCase({ playlistRepository, videoCatalog }),
    updatePlaylist: new UpdatePlaylistUseCase({ playlistRepository }),
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
}): Promise<
  | { ok: true; data: PlaylistPlaybackQueue }
  | Extract<GetPlaylistDetailsUseCaseResult, { ok: false }>
> {
  const result = await getServerPlaylistServices().getPlaylistDetails.execute({
    includeRelated: false,
    includeVideos: false,
    ownerId: input.viewer.type === 'authenticated' ? input.viewer.userId : undefined,
    playlistId: input.playlistId,
    videoLimit: 1,
    videoOffset: 0,
  });
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    data: {
      id: result.data.playlist.id,
      name: result.data.playlist.name,
      videoIds: result.data.playlist.videoIds,
    },
  };
}
