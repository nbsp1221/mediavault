import { createMigratedPrimarySqliteDatabase } from '../../app/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { toRequestCookieHeader } from '../helpers/cookies';
import { E2E_AUTH_PASSWORD, E2E_AUTH_USERNAME, seedRuntimeAuthUser } from './auth-account';
import { createRuntimeTestWorkspace } from './create-runtime-test-workspace';
import { TEST_DATABASE_ENCRYPTION_KEY } from './database-encryption-key';
import { type SeedLibraryVideoInput, seedLibraryVideoMetadata } from './seed-library-video-metadata';

export const PLAYLIST_OWNER_ID = 'seeded-owner-1';

interface PlaylistRuntimeWorkspaceOptions {
  playlistItems?: unknown[];
  playlists?: unknown[];
  videos?: SeedLibraryVideoInput[];
}

const DEFAULT_VIDEOS = [
  {
    createdAt: '2026-03-21T00:00:00.000Z',
    description: 'Fixture video one',
    duration: 90,
    id: 'playlist-video-1',
    tags: ['vault', 'action'],
    thumbnailUrl: '/api/thumbnail/playlist-video-1',
    title: 'Playlist Fixture One',
    videoUrl: '/videos/playlist-video-1/manifest.mpd',
  },
  {
    createdAt: '2026-03-22T00:00:00.000Z',
    description: 'Fixture video two',
    duration: 120,
    id: 'playlist-video-2',
    tags: ['vault'],
    thumbnailUrl: '/api/thumbnail/playlist-video-2',
    title: 'Playlist Fixture Two',
    videoUrl: '/videos/playlist-video-2/manifest.mpd',
  },
];

const DEFAULT_PLAYLISTS = [
  {
    createdAt: '2026-03-23T00:00:00.000Z',
    description: 'Owned private playlist',
    id: 'playlist-owned-private',
    isPublic: false,
    name: 'Owned Private Playlist',
    ownerId: PLAYLIST_OWNER_ID,
    type: 'user_created',
    updatedAt: '2026-03-24T00:00:00.000Z',
    videoIds: ['playlist-video-1'],
  },
  {
    createdAt: '2026-03-24T00:00:00.000Z',
    description: 'Public playlist for anonymous access paths',
    id: 'playlist-public',
    isPublic: true,
    name: 'Public Playlist',
    ownerId: 'other-user',
    type: 'user_created',
    updatedAt: '2026-03-25T00:00:00.000Z',
    videoIds: ['playlist-video-2'],
  },
];

interface PlaylistRuntimeWorkspace {
  authDbPath: string;
  databasePath: string;
  cleanup: () => Promise<void>;
  login: () => Promise<string>;
  rootDir: string;
  storageDir: string;
  videoMetadataDbPath: string;
}

const ENV_KEYS_TO_RESTORE = [
  'DATABASE_SQLITE_PATH',
  'MEDIAVAULT_DATABASE_ENCRYPTION_KEY',
  'STORAGE_DIR',
  'VIDEO_JWT_SECRET',
  'VIDEO_MASTER_ENCRYPTION_SEED',
] as const;

type RestorableEnvKey = typeof ENV_KEYS_TO_RESTORE[number];
type PreviousEnvValues = Record<RestorableEnvKey, string | undefined>;

interface SeedPlaylistRow {
  createdAt?: string;
  description?: string;
  id: string;
  isPublic?: boolean;
  metadata?: Record<string, unknown>;
  name: string;
  ownerId: string;
  thumbnailUrl?: string;
  type: string;
  updatedAt?: string;
  videoIds?: string[];
}

interface SeedPlaylistItemRow {
  addedAt?: string;
  addedBy?: string;
  episodeMetadata?: Record<string, unknown>;
  playlistId: string;
  position?: number;
  videoId: string;
}

function normalizePlaylistRows(value: unknown[] | undefined): SeedPlaylistRow[] {
  return (value ?? DEFAULT_PLAYLISTS) as SeedPlaylistRow[];
}

function normalizePlaylistItemRows(
  playlists: SeedPlaylistRow[],
  value: unknown[] | undefined,
): SeedPlaylistItemRow[] {
  if (value) {
    return value as SeedPlaylistItemRow[];
  }

  return playlists.flatMap(playlist => (playlist.videoIds ?? []).map((videoId, index) => ({
    addedAt: playlist.updatedAt ?? playlist.createdAt,
    addedBy: playlist.ownerId,
    playlistId: playlist.id,
    position: index + 1,
    videoId,
  })));
}

function collectReferencedVideoIds(playlists: SeedPlaylistRow[], playlistItems: SeedPlaylistItemRow[]) {
  return Array.from(new Set([
    ...playlists.flatMap(playlist => playlist.videoIds ?? []),
    ...playlistItems.map(item => item.videoId),
  ]));
}

async function seedPlaylists(databasePath: string, input: {
  playlistItems?: unknown[];
  playlists?: unknown[];
}) {
  const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
  const playlists = normalizePlaylistRows(input.playlists);
  const playlistItems = normalizePlaylistItemRows(playlists, input.playlistItems);

  await database.transaction(async (transaction) => {
    for (const playlist of playlists) {
      await transaction.prepare(`
        INSERT INTO playlists (
          id,
          owner_id,
          name,
          name_key,
          description,
          type,
          is_public,
          thumbnail_path,
          metadata_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        playlist.id,
        playlist.ownerId,
        playlist.name,
        playlist.name.trim().toLowerCase(),
        playlist.description ?? null,
        playlist.type,
        playlist.isPublic ? 1 : 0,
        playlist.thumbnailUrl ?? null,
        playlist.metadata ? JSON.stringify(playlist.metadata) : null,
        playlist.createdAt ?? new Date(0).toISOString(),
        playlist.updatedAt ?? playlist.createdAt ?? new Date(0).toISOString(),
      );
    }

    for (const item of playlistItems) {
      await transaction.prepare(`
        INSERT INTO playlist_items (
          playlist_id,
          video_id,
          position,
          added_at,
          added_by,
          episode_metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        item.playlistId,
        item.videoId,
        Math.max((item.position ?? 1) - 1, 0),
        item.addedAt ?? new Date(0).toISOString(),
        item.addedBy ?? PLAYLIST_OWNER_ID,
        item.episodeMetadata ? JSON.stringify(item.episodeMetadata) : null,
      );
    }
  });
}

export async function createPlaylistRuntimeTestWorkspace(
  options: PlaylistRuntimeWorkspaceOptions = {},
): Promise<PlaylistRuntimeWorkspace> {
  const previousEnv = ENV_KEYS_TO_RESTORE.reduce<PreviousEnvValues>((values, key) => {
    values[key] = process.env[key];
    return values;
  }, {} as PreviousEnvValues);
  const workspace = await createRuntimeTestWorkspace();
  const playlists = normalizePlaylistRows(options.playlists);
  const playlistItems = normalizePlaylistItemRows(playlists, options.playlistItems);

  function restoreEnvValue(key: RestorableEnvKey): void {
    const value = previousEnv[key];
    if (value === undefined) {
      delete process.env[key];
      return;
    }

    process.env[key] = value;
  }

  process.env.DATABASE_SQLITE_PATH = workspace.databasePath;
  process.env.MEDIAVAULT_DATABASE_ENCRYPTION_KEY = TEST_DATABASE_ENCRYPTION_KEY;
  process.env.STORAGE_DIR = workspace.storageDir;
  delete process.env.VIDEO_JWT_SECRET;
  delete process.env.VIDEO_MASTER_ENCRYPTION_SEED;

  await seedLibraryVideoMetadata(
    workspace.databasePath,
    options.videos ?? DEFAULT_VIDEOS,
  );
  const seededVideoIds = new Set((options.videos ?? DEFAULT_VIDEOS).map(video => video.id));
  const missingReferencedVideos = collectReferencedVideoIds(playlists, playlistItems)
    .filter(videoId => !seededVideoIds.has(videoId))
    .map((videoId, index) => ({
      createdAt: '2026-03-21T00:00:00.000Z',
      description: `Generated playlist fixture for ${videoId}`,
      duration: 60 + index,
      id: videoId,
      tags: ['playlist'],
      thumbnailUrl: `/api/thumbnail/${videoId}`,
      title: videoId,
      videoUrl: `/videos/${videoId}/manifest.mpd`,
    }));

  if (missingReferencedVideos.length > 0) {
    await seedLibraryVideoMetadata(workspace.databasePath, missingReferencedVideos);
  }

  await seedPlaylists(workspace.databasePath, {
    playlistItems,
    playlists,
  });
  await seedRuntimeAuthUser(workspace.databasePath, {
    password: E2E_AUTH_PASSWORD,
    userId: PLAYLIST_OWNER_ID,
    username: E2E_AUTH_USERNAME,
  });

  return {
    authDbPath: workspace.authDbPath,
    databasePath: workspace.databasePath,
    cleanup: async () => {
      for (const key of ENV_KEYS_TO_RESTORE) {
        restoreEnvValue(key);
      }
      await workspace.cleanup();
    },
    login: async () => {
      const { action } = await import('../../app/routes/api.auth.login');
      const response = await action({
        request: new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({
            password: E2E_AUTH_PASSWORD,
            username: E2E_AUTH_USERNAME,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      } as never);

      return toRequestCookieHeader(response.headers.get('Set-Cookie'));
    },
    rootDir: workspace.rootDir,
    storageDir: workspace.storageDir,
    videoMetadataDbPath: workspace.videoMetadataDbPath,
  };
}
