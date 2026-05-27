import type { VideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { PlaylistItem } from '../../domain/playlist';

export interface PlaylistCatalogVideoSummary {
  duration: number;
  id: string;
  thumbnailUrl?: string;
  title: string;
}

export interface PlaylistCatalogVideo {
  duration: number;
  episodeMetadata?: PlaylistItem['episodeMetadata'];
  id: string;
  position: number;
  thumbnailUrl?: string;
  title: string;
}

export interface PlaylistVideoCatalogPort {
  findById(videoId: string, scope: VideoReadAccessScope): Promise<PlaylistCatalogVideoSummary | null>;
  getPlaylistVideos(items: PlaylistItem[], scope: VideoReadAccessScope): Promise<PlaylistCatalogVideo[]>;
}
