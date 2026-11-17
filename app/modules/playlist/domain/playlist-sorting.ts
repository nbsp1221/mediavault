import type { Playlist } from './playlist';

export type PlaylistSortField = 'name' | 'createdAt' | 'updatedAt' | 'videoCount';
export type PlaylistSortOrder = 'asc' | 'desc';

export function sortPlaylists(
  playlists: Playlist[],
  options: {
    sortBy: PlaylistSortField;
    sortOrder: PlaylistSortOrder;
  },
): Playlist[] {
  return [...playlists].sort((left, right) => {
    let comparison = 0;

    switch (options.sortBy) {
      case 'name':
        comparison = left.name.localeCompare(right.name);
        break;
      case 'createdAt':
        comparison = left.createdAt.getTime() - right.createdAt.getTime();
        break;
      case 'updatedAt':
        comparison = left.updatedAt.getTime() - right.updatedAt.getTime();
        break;
      case 'videoCount':
        comparison = left.videoIds.length - right.videoIds.length;
        break;
    }

    return options.sortOrder === 'desc' ? -comparison : comparison;
  });
}
