import type { VideoReadAccessScope } from '../policies/video-read-access-scope';

export interface ReadyVideoSummary {
  duration: number;
  id: string;
  thumbnailUrl?: string;
  title: string;
}

export interface ReadyCatalogVideo extends ReadyVideoSummary {
  createdAt: Date;
  description?: string;
  tags: string[];
  videoUrl: string;
}

/** Playback projections require both read access and a ready media asset. */
export interface ReadyVideoCatalogPort {
  findReadyVideoById(
    videoId: string,
    scope: VideoReadAccessScope,
  ): Promise<ReadyVideoSummary | null>;
  listReadyVideos(scope: VideoReadAccessScope): Promise<ReadyCatalogVideo[]>;
}
