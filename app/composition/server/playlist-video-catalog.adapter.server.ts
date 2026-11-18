import type { VideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { ReadyVideoCatalogPort } from '~/modules/library/application/ports/ready-video-catalog.port';
import type { PlaylistVideoCatalogPort } from '~/modules/playlist/application/ports/playlist-video-catalog.port';
import type { PlaylistItem } from '~/modules/playlist/domain/playlist';

export class PlaylistVideoCatalogAdapter implements PlaylistVideoCatalogPort {
  constructor(
    private readonly deps: { catalog: Pick<ReadyVideoCatalogPort, 'findReadyVideoById'> },
  ) {}

  findById(videoId: string, scope: VideoReadAccessScope) {
    return this.deps.catalog.findReadyVideoById(videoId, scope);
  }

  async getPlaylistVideos(items: PlaylistItem[], scope: VideoReadAccessScope) {
    const resolved = await Promise.all(
      items.map(async (item) => {
        const video = await this.deps.catalog.findReadyVideoById(item.videoId, scope);
        return video
          ? { ...video, episodeMetadata: item.episodeMetadata, position: item.position }
          : null;
      }),
    );
    return resolved.filter((video) => video !== null);
  }
}
