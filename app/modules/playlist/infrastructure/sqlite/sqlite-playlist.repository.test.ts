import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { SqliteLibraryVideoMetadataRepository } from '~/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository';
import { createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { SqlitePlaylistRepository } from './sqlite-playlist.repository';

describe('SqlitePlaylistRepository', () => {
  let dbPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'local-streamer-playlist-'));
    dbPath = join(tempDir, 'db.sqlite');
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  async function seedVideo(id: string, title = id) {
    const repository = new SqliteLibraryVideoMetadataRepository({ dbPath });
    const database = await createMigratedPrimarySqliteDatabase({ dbPath });
    const sortIndex = Number(id.match(/\d+$/)?.[0] ?? 1);
    await seedOwner(database, 'owner-1');

    await repository.create({
      contentTypeSlug: 'movie',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      description: title,
      duration: 60,
      genreSlugs: ['action'],
      id,
      ownerId: 'owner-1',
      sortIndex,
      tags: ['vault'],
      thumbnailUrl: `/api/thumbnail/${id}`,
      title,
      videoUrl: `/videos/${id}/manifest.mpd`,
      visibility: 'private',
    });
  }

  test('creates playlists, stores item rows in zero-based order, and exposes one-based item positions', async () => {
    await seedVideo('video-1');
    await seedVideo('video-2');
    const database = await createMigratedPrimarySqliteDatabase({ dbPath });
    const repository = new SqlitePlaylistRepository({ dbPath });

    const playlist = await repository.create({
      isPublic: false,
      metadata: { genre: ['action'], seriesName: 'Vault' },
      name: 'Owned Playlist',
      ownerId: 'owner-1',
      type: 'user_created',
      videoIds: ['video-1', 'video-2'],
    });

    await expect(repository.findById(playlist.id)).resolves.toEqual(expect.objectContaining({
      metadata: { genre: ['action'], seriesName: 'Vault' },
      name: 'Owned Playlist',
      videoIds: ['video-1', 'video-2'],
    }));
    await expect(repository.getPlaylistItems(playlist.id)).resolves.toEqual([
      expect.objectContaining({ position: 1, videoId: 'video-1' }),
      expect.objectContaining({ position: 2, videoId: 'video-2' }),
    ]);

    const rows = await database
      .prepare<{ position: number; video_id: string }>(`
        SELECT video_id, position
        FROM playlist_items
        WHERE playlist_id = ?
        ORDER BY position ASC
      `)
      .all(playlist.id);

    expect(rows).toEqual([
      { position: 0, video_id: 'video-1' },
      { position: 1, video_id: 'video-2' },
    ]);
  });

  test('prevents duplicate owner names case-insensitively', async () => {
    const repository = new SqlitePlaylistRepository({ dbPath });

    const playlist = await repository.create({
      isPublic: false,
      name: 'Vault',
      ownerId: 'owner-1',
      type: 'user_created',
    });

    await expect(repository.nameExistsForOwner('vault', 'owner-1')).resolves.toBe(true);
    await expect(repository.nameExistsForOwner('vault', 'owner-1', playlist.id)).resolves.toBe(false);
    await expect(repository.nameExistsForOwner('vault', 'owner-2')).resolves.toBe(false);
  });

  test('adds, reorders, removes items, and preserves item metadata', async () => {
    await seedVideo('video-1');
    await seedVideo('video-2');
    const repository = new SqlitePlaylistRepository({ dbPath });
    const playlist = await repository.create({
      isPublic: false,
      name: 'Vault',
      ownerId: 'owner-1',
      type: 'user_created',
      videoIds: ['video-1'],
    });

    await repository.addVideoToPlaylist(
      playlist.id,
      'video-2',
      0,
      { episodeNumber: 2, episodeTitle: 'Companion' },
    );

    await expect(repository.findById(playlist.id)).resolves.toEqual(expect.objectContaining({
      videoIds: ['video-2', 'video-1'],
    }));
    await expect(repository.getPlaylistItems(playlist.id)).resolves.toEqual([
      expect.objectContaining({
        episodeMetadata: { episodeNumber: 2, episodeTitle: 'Companion' },
        position: 1,
        videoId: 'video-2',
      }),
      expect.objectContaining({ position: 2, videoId: 'video-1' }),
    ]);

    await repository.reorderPlaylistItems(playlist.id, ['video-1', 'video-2']);

    await expect(repository.getPlaylistItems(playlist.id)).resolves.toEqual([
      expect.objectContaining({ position: 1, videoId: 'video-1' }),
      expect.objectContaining({
        episodeMetadata: { episodeNumber: 2, episodeTitle: 'Companion' },
        position: 2,
        videoId: 'video-2',
      }),
    ]);

    await repository.removeVideoFromPlaylist(playlist.id, 'video-2');

    await expect(repository.getPlaylistItems(playlist.id)).resolves.toEqual([
      expect.objectContaining({ position: 1, videoId: 'video-1' }),
    ]);
  });

  test('filters by metadata and deletes cascaded playlist items', async () => {
    await seedVideo('video-1');
    const repository = new SqlitePlaylistRepository({ dbPath });
    const playlist = await repository.create({
      isPublic: true,
      metadata: { genre: ['action'], seriesName: 'Vault', status: 'ongoing' },
      name: 'Vault Series',
      ownerId: 'owner-1',
      type: 'series',
      videoIds: ['video-1'],
    });

    await expect(repository.findWithFilters({
      genre: ['action'],
      isPublic: true,
      ownerId: 'owner-1',
      searchQuery: 'series',
      seriesName: 'Vault',
      status: 'ongoing',
      type: 'series',
    })).resolves.toEqual([
      expect.objectContaining({ id: playlist.id }),
    ]);
    await expect(repository.findBySeries('vault')).resolves.toEqual([
      expect.objectContaining({ id: playlist.id }),
    ]);
    await expect(repository.delete(playlist.id)).resolves.toBe(true);
    await expect(repository.findById(playlist.id)).resolves.toBeNull();
    await expect(repository.getPlaylistItems(playlist.id)).resolves.toEqual([]);
  });
});

type TestDatabase = Awaited<ReturnType<typeof createMigratedPrimarySqliteDatabase>>;

async function seedOwner(database: TestDatabase, ownerId: string) {
  await database.prepare(`
    INSERT INTO auth_users (
      id,
      username,
      username_key,
      password_hash,
      role,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(
    ownerId,
    ownerId,
    ownerId,
    'test-password-hash',
    'user',
    '2026-05-23T00:00:00.000Z',
  );
}
