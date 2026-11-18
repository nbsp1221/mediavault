import type { VideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { ReadyVideoCatalogPort } from '~/modules/library/application/ports/ready-video-catalog.port';
import type { VideoCatalogPort } from '~/modules/playback/application/ports/video-catalog.port';
import { findRelatedVideos } from '~/modules/playback/application/policies/related-videos';

export class PlaybackVideoCatalogAdapter implements VideoCatalogPort {
  constructor(private readonly deps: { catalog: Pick<ReadyVideoCatalogPort, 'listReadyVideos'> }) {}

  async getPlayerVideo(videoId: string, scope: VideoReadAccessScope) {
    const videos = await this.deps.catalog.listReadyVideos(scope);
    const currentVideo = videos.find((video) => video.id === videoId);
    return currentVideo
      ? {
          relatedVideos: findRelatedVideos(currentVideo, videos),
          video: currentVideo,
        }
      : null;
  }
}
