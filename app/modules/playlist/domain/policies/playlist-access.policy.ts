import type { Playlist } from '../playlist';

export interface PlaylistPermissions {
  canAddVideos: boolean;
  canDelete: boolean;
  canEdit: boolean;
}

export class PlaylistAccessPolicy {
  static canAccess(input: { ownerId?: string; playlist: Playlist }): boolean {
    if (input.playlist.isPublic) {
      return true;
    }

    if (!input.ownerId) {
      return false;
    }

    return input.playlist.ownerId === input.ownerId;
  }

  static canManage(input: { ownerId?: string; playlist: Playlist }): boolean {
    return Boolean(input.ownerId && input.playlist.ownerId === input.ownerId);
  }

  static describePermissions(input: { ownerId?: string; playlist: Playlist }): PlaylistPermissions {
    const isOwner = this.canManage(input);

    return {
      canAddVideos: isOwner,
      canDelete: isOwner,
      canEdit: isOwner,
    };
  }
}
