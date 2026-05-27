import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SqliteLibraryVideoMetadataRepository } from '~/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository';
import { createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';

const ORIGINAL_STORAGE_DIR = process.env.MEDIAVAULT_STORAGE_DIR;
const ownerReadScope = {
  ownerId: 'owner-1',
  type: 'public_or_owned' as const,
};

afterEach(() => {
  vi.resetModules();

  if (ORIGINAL_STORAGE_DIR === undefined) {
    delete process.env.MEDIAVAULT_STORAGE_DIR;
  }
  else {
    process.env.MEDIAVAULT_STORAGE_DIR = ORIGINAL_STORAGE_DIR;
  }
});

describe('PlaybackVideoCatalogAdapter', () => {
  test('returns the current video and related videos without exposing repository details upward', async () => {
    const { PlaybackVideoCatalogAdapter } = await import('./playback-video-catalog.adapter');
    const adapter = new PlaybackVideoCatalogAdapter({
      repository: {
        findAll: async () => [
          {
            createdAt: new Date('2026-03-02T00:00:00.000Z'),
            duration: 120,
            id: 'video-1',
            ownerId: 'owner-1',
            tags: ['Drama', 'Vault'],
            title: 'Current video',
            videoUrl: '/videos/video-1/manifest.mpd',
            visibility: 'private',
          },
          {
            createdAt: new Date('2026-03-01T00:00:00.000Z'),
            duration: 40,
            id: 'video-2',
            ownerId: 'owner-1',
            tags: ['drama'],
            title: 'Related video',
            videoUrl: '/videos/video-2/manifest.mpd',
            visibility: 'private',
          },
          {
            createdAt: new Date('2026-02-28T00:00:00.000Z'),
            duration: 60,
            id: 'video-3',
            ownerId: 'owner-1',
            tags: ['other'],
            title: 'Unrelated video',
            videoUrl: '/videos/video-3/manifest.mpd',
            visibility: 'private',
          },
        ],
      },
    });

    const result = await adapter.getPlayerVideo('video-1', ownerReadScope);

    expect(result).toEqual({
      relatedVideos: [
        {
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          duration: 40,
          id: 'video-2',
          ownerId: 'owner-1',
          tags: ['drama'],
          title: 'Related video',
          videoUrl: '/videos/video-2/manifest.mpd',
          visibility: 'private',
        },
      ],
      video: {
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
        duration: 120,
        id: 'video-1',
        ownerId: 'owner-1',
        tags: ['Drama', 'Vault'],
        title: 'Current video',
        videoUrl: '/videos/video-1/manifest.mpd',
        visibility: 'private',
      },
    });
  });

  test('returns null when the playback repository cannot resolve the requested video', async () => {
    const { PlaybackVideoCatalogAdapter } = await import('./playback-video-catalog.adapter');
    const adapter = new PlaybackVideoCatalogAdapter({
      repository: {
        findAll: async () => [],
      },
    });

    await expect(adapter.getPlayerVideo('missing-video', ownerReadScope)).resolves.toBeNull();
  });

  async function seedReadyVideo(dbPath: string, input: {
    createdAt?: Date;
    duration?: number;
    id: string;
    ownerId?: string;
    sortIndex?: number;
    tags?: string[];
    title: string;
    visibility?: 'private' | 'public';
  }) {
    const repository = new SqliteLibraryVideoMetadataRepository({ dbPath });
    const database = await createMigratedPrimarySqliteDatabase({ dbPath });
    await seedOwner(database, input.ownerId ?? 'owner-1');

    await repository.create({
      contentTypeSlug: 'movie',
      createdAt: input.createdAt ?? new Date('2026-03-02T00:00:00.000Z'),
      description: 'Playback source',
      duration: input.duration ?? 120,
      genreSlugs: [],
      id: input.id,
      ownerId: input.ownerId ?? 'owner-1',
      sortIndex: input.sortIndex ?? Number(input.id.match(/\d+$/)?.[0] ?? 1),
      tags: input.tags ?? [],
      thumbnailUrl: `/api/thumbnail/${input.id}`,
      title: input.title,
      videoUrl: `/videos/${input.id}/manifest.mpd`,
      visibility: input.visibility ?? 'private',
    });
    await database.prepare(`
      INSERT INTO video_media_assets (
        video_id,
        status,
        layout_version,
        preparation_strategy,
        manifest_relpath,
        key_relpath,
        thumbnail_relpath,
        video_init_relpath,
        video_segment_glob,
        audio_init_relpath,
        audio_segment_glob,
        prepared_at
      ) VALUES (?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      1,
      'fixture',
      `${input.id}/manifest.mpd`,
      `${input.id}/key.bin`,
      `${input.id}/thumbnail.jpg`,
      `${input.id}/video/init.mp4`,
      `${input.id}/video/segment-*.m4s`,
      `${input.id}/audio/init.mp4`,
      `${input.id}/audio/segment-*.m4s`,
      '2026-03-02T00:00:00.000Z',
    );
  }

  test('reads player video data from ready primary SQLite media assets', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-catalog-'));
    const storageDir = path.join(rootDir, 'storage');
    const sqlitePath = path.join(storageDir, 'db.sqlite');
    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;
    await seedReadyVideo(sqlitePath, {
      id: 'video-1',
      tags: ['Drama', 'Vault'],
      title: 'Current video',
    });

    try {
      const { PlaybackVideoCatalogAdapter } = await import('./playback-video-catalog.adapter');
      const adapter = new PlaybackVideoCatalogAdapter({ dbPath: sqlitePath });

      await expect(adapter.getPlayerVideo('video-1', ownerReadScope)).resolves.toEqual({
        relatedVideos: [],
        video: expect.objectContaining({
          id: 'video-1',
          title: 'Current video',
        }),
      });
    }
    finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  test('does not expose videos without ready media assets to playback', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-catalog-'));
    const storageDir = path.join(rootDir, 'storage');
    const sqlitePath = path.join(storageDir, 'db.sqlite');
    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;
    const repository = new SqliteLibraryVideoMetadataRepository({ dbPath: sqlitePath });
    const database = await createMigratedPrimarySqliteDatabase({ dbPath: sqlitePath });
    await seedOwner(database, 'owner-1');
    await repository.create({
      contentTypeSlug: 'movie',
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
      duration: 120,
      genreSlugs: [],
      id: 'video-1',
      ownerId: 'owner-1',
      sortIndex: 1,
      tags: ['Drama'],
      title: 'Unready video',
      videoUrl: '/videos/video-1/manifest.mpd',
      visibility: 'private',
    });

    try {
      const { PlaybackVideoCatalogAdapter } = await import('./playback-video-catalog.adapter');
      const adapter = new PlaybackVideoCatalogAdapter({ dbPath: sqlitePath });

      await expect(adapter.getPlayerVideo('video-1', ownerReadScope)).resolves.toBeNull();
    }
    finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  test('applies read access scope before resolving player and related videos', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-catalog-'));
    const storageDir = path.join(rootDir, 'storage');
    const sqlitePath = path.join(storageDir, 'db.sqlite');
    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;
    await seedReadyVideo(sqlitePath, {
      id: 'owner-private',
      ownerId: 'owner-1',
      sortIndex: 3,
      tags: ['Drama'],
      title: 'Owner private',
      visibility: 'private',
    });
    await seedReadyVideo(sqlitePath, {
      id: 'other-private',
      ownerId: 'owner-2',
      sortIndex: 2,
      tags: ['Drama'],
      title: 'Other private',
      visibility: 'private',
    });
    await seedReadyVideo(sqlitePath, {
      id: 'other-public',
      ownerId: 'owner-2',
      sortIndex: 1,
      tags: ['Drama'],
      title: 'Other public',
      visibility: 'public',
    });

    try {
      const { PlaybackVideoCatalogAdapter } = await import('./playback-video-catalog.adapter');
      const adapter = new PlaybackVideoCatalogAdapter({ dbPath: sqlitePath });

      await expect(adapter.getPlayerVideo('other-private', ownerReadScope)).resolves.toBeNull();
      await expect(adapter.getPlayerVideo('owner-private', ownerReadScope)).resolves.toEqual({
        relatedVideos: [
          expect.objectContaining({ id: 'other-public' }),
        ],
        video: expect.objectContaining({ id: 'owner-private' }),
      });
    }
    finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  test('preserves createdAt timestamps from primary SQLite metadata', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-catalog-'));
    const storageDir = path.join(rootDir, 'storage');
    const sqlitePath = path.join(storageDir, 'db.sqlite');
    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;
    await seedReadyVideo(sqlitePath, {
      createdAt: new Date('2025-01-02T03:04:05.000Z'),
      id: 'video-1',
      tags: ['Drama'],
      title: 'Historical timestamp video',
    });

    try {
      const { PlaybackVideoCatalogAdapter } = await import('./playback-video-catalog.adapter');
      const adapter = new PlaybackVideoCatalogAdapter({ dbPath: sqlitePath });

      await expect(adapter.getPlayerVideo('video-1', ownerReadScope)).resolves.toEqual({
        relatedVideos: [],
        video: expect.objectContaining({
          createdAt: new Date('2025-01-02T03:04:05.000Z'),
          id: 'video-1',
          title: 'Historical timestamp video',
        }),
      });
    }
    finally {
      await rm(rootDir, { force: true, recursive: true });
    }
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
