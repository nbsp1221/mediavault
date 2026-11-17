export type {
  CreatePlaylistRequest,
  Playlist,
  PlaylistFilters,
  PlaylistItem,
  PlaylistMetadata,
  PlaylistType,
  PlaylistWithVideos,
  UpdatePlaylistRequest,
} from '~/modules/playlist/domain/playlist';

export function playlistPlaybackHref(playlistId: string, videoId: string): string {
  return `/player/${encodeURIComponent(videoId)}?playlist=${encodeURIComponent(playlistId)}`;
}
