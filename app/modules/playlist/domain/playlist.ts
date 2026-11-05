export interface Playlist {
  id: string;
  name: string;
  description?: string;
  type: PlaylistType;
  videoIds: string[];
  thumbnailUrl?: string;
  ownerId: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: PlaylistMetadata;
}

export type PlaylistType = 'user_created' | 'series' | 'season' | 'auto_generated';

export interface PlaylistMetadata {
  seriesName?: string;
  seasonNumber?: number;
  episodeCount?: number;
  genre?: string[];
  year?: number;
  status?: 'ongoing' | 'completed' | 'hiatus';
  parentPlaylistId?: string;
  originalLanguage?: string;
  studio?: string;
  rating?: string;
}

export interface PlaylistItem {
  playlistId?: string;
  videoId: string;
  position: number;
  addedAt: Date;
  addedBy: string;
  episodeMetadata?: {
    episodeNumber?: number;
    episodeTitle?: string;
    watchProgress?: number;
    duration?: number;
    notes?: string;
  };
}

export interface CreatePlaylistRequest {
  name: string;
  description?: string;
  type: PlaylistType;
  isPublic?: boolean;
  metadata?: PlaylistMetadata;
  initialVideoIds?: string[];
}

export interface UpdatePlaylistRequest {
  name?: string;
  description?: string;
  isPublic?: boolean;
  metadata?: PlaylistMetadata;
}

export interface PlaylistFilters {
  type?: PlaylistType;
  ownerId?: string;
  isPublic?: boolean;
  genre?: string[];
  searchQuery?: string;
  seriesName?: string;
  status?: 'ongoing' | 'completed' | 'hiatus';
}

export interface PlaylistWithVideos extends Playlist {
  videos: Array<{
    id: string;
    title: string;
    thumbnailUrl?: string;
    duration: number;
    position: number;
    episodeMetadata?: PlaylistItem['episodeMetadata'];
  }>;
}
