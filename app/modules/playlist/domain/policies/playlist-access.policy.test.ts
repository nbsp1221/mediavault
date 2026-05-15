import { describe, expect, test } from 'vitest';
import type { Playlist } from '../playlist';

function createPlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    createdAt: new Date('2026-03-08T00:00:00.000Z'),
    id: 'playlist-1',
    isPublic: false,
    name: 'Vault',
    ownerId: 'owner-1',
    type: 'user_created',
    updatedAt: new Date('2026-03-08T00:00:00.000Z'),
    videoIds: ['video-1'],
    ...overrides,
  };
}

describe('PlaylistAccessPolicy', () => {
  test('allows public playlists and owner-only access for private playlists', async () => {
    const { PlaylistAccessPolicy } = await import('./playlist-access.policy');

    expect(PlaylistAccessPolicy.canAccess({
      ownerId: undefined,
      playlist: createPlaylist({ isPublic: true }),
    })).toBe(true);
    expect(PlaylistAccessPolicy.canAccess({
      ownerId: 'owner-1',
      playlist: createPlaylist(),
    })).toBe(true);
    expect(PlaylistAccessPolicy.canAccess({
      ownerId: 'other-user',
      playlist: createPlaylist(),
    })).toBe(false);
    expect(PlaylistAccessPolicy.canAccess({
      ownerId: undefined,
      playlist: createPlaylist(),
    })).toBe(false);
  });

  test('derives permissions from owner access and public visibility', async () => {
    const { PlaylistAccessPolicy } = await import('./playlist-access.policy');

    expect(PlaylistAccessPolicy.describePermissions({
      ownerId: 'owner-1',
      playlist: createPlaylist(),
    })).toEqual({
      canAddVideos: true,
      canDelete: true,
      canEdit: true,
      canShare: true,
    });

    expect(PlaylistAccessPolicy.describePermissions({
      ownerId: 'viewer-2',
      playlist: createPlaylist({ isPublic: true }),
    })).toEqual({
      canAddVideos: false,
      canDelete: false,
      canEdit: false,
      canShare: true,
    });

    expect(PlaylistAccessPolicy.describePermissions({
      ownerId: 'viewer-2',
      playlist: createPlaylist(),
    })).toEqual({
      canAddVideos: false,
      canDelete: false,
      canEdit: false,
      canShare: false,
    });
  });
});
