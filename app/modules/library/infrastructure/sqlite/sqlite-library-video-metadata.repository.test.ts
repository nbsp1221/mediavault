import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { SqliteLibraryVideoMetadataRepository } from './sqlite-library-video-metadata.repository';

describe('SqliteLibraryVideoMetadataRepository', () => {
  let dbPath: string;
  let tempDir: string;
  const originalStorageDir = process.env.MEDIAVAULT_STORAGE_DIR;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'local-streamer-video-metadata-'));
    dbPath = join(tempDir, 'db.sqlite');
    process.env.MEDIAVAULT_STORAGE_DIR = tempDir;
  });

  afterEach(async () => {
    if (originalStorageDir === undefined) {
      delete process.env.MEDIAVAULT_STORAGE_DIR;
    }
    else {
      process.env.MEDIAVAULT_STORAGE_DIR = originalStorageDir;
    }

    await rm(tempDir, { force: true, recursive: true });
  });

  test('stores records and returns newest-first order through sortIndex', async () => {
    const repository = new SqliteLibraryVideoMetadataRepository({ dbPath });

    await repository.create({
      contentTypeSlug: 'home_video',
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      description: 'Older fixture',
      duration: 90,
      genreSlugs: [],
      id: 'video-older',
      sortIndex: 1,
      tags: ['vault'],
      thumbnailUrl: '/api/thumbnail/video-older',
      title: 'Older fixture',
      videoUrl: '/videos/video-older/manifest.mpd',
    });
    await repository.create({
      contentTypeSlug: 'movie',
      createdAt: new Date('2026-03-22T00:00:00.000Z'),
      description: 'Newest fixture',
      duration: 120,
      genreSlugs: ['action'],
      id: 'video-newest',
      sortIndex: 2,
      tags: ['action', 'vault'],
      thumbnailUrl: '/api/thumbnail/video-newest',
      title: 'Newest fixture',
      videoUrl: '/videos/video-newest/manifest.mpd',
    });

    await expect(repository.findAll()).resolves.toEqual([
      expect.objectContaining({
        contentTypeSlug: 'movie',
        genreSlugs: ['action'],
        id: 'video-newest',
        title: 'Newest fixture',
      }),
      expect.objectContaining({
        id: 'video-older',
        title: 'Older fixture',
      }),
    ]);
  });

  test('supports update, tag/title search, and delete without losing createdAt', async () => {
    const repository = new SqliteLibraryVideoMetadataRepository({ dbPath });

    const created = await repository.create({
      contentTypeSlug: 'movie',
      createdAt: new Date('2026-03-23T00:00:00.000Z'),
      description: 'Original description',
      duration: 180,
      genreSlugs: ['action', 'drama'],
      id: 'video-1',
      sortIndex: 1,
      tags: ['Action', 'Neo'],
      thumbnailUrl: '/api/thumbnail/video-1',
      title: 'Original title',
      videoUrl: '/videos/video-1/manifest.mpd',
    });

    const undefinedContentTypeUpdate = await repository.update('video-1', {
      contentTypeSlug: undefined,
      title: 'Undefined content type update',
    });

    expect(undefinedContentTypeUpdate).toEqual(expect.objectContaining({
      contentTypeSlug: 'movie',
      title: 'Undefined content type update',
    }));

    const updated = await repository.update('video-1', {
      contentTypeSlug: null,
      description: 'Updated description',
      duration: 240,
      genreSlugs: ['documentary'],
      tags: ['Neo'],
      thumbnailUrl: '/api/thumbnail/video-1',
      title: 'Updated title',
      videoUrl: '/videos/video-1/manifest.mpd',
    });

    expect(updated).toEqual({
      ...created,
      contentTypeSlug: undefined,
      description: 'Updated description',
      duration: 240,
      genreSlugs: ['documentary'],
      tags: ['neo'],
      thumbnailUrl: '/api/thumbnail/video-1',
      title: 'Updated title',
      videoUrl: '/videos/video-1/manifest.mpd',
    });
    await expect(repository.findByTitle('updated')).resolves.toEqual([
      expect.objectContaining({ id: 'video-1' }),
    ]);
    await expect(repository.findByTag('neo')).resolves.toEqual([
      expect.objectContaining({ id: 'video-1' }),
    ]);
    await expect(repository.search('updated')).resolves.toEqual([
      expect.objectContaining({ id: 'video-1' }),
    ]);
    await expect(repository.getAllTags()).resolves.toEqual(['neo']);
    await expect(repository.exists('video-1')).resolves.toBe(true);
    await expect(repository.count()).resolves.toBe(1);

    await expect(repository.delete('video-1')).resolves.toBe(true);
    await expect(repository.findById('video-1')).resolves.toBeNull();
    await expect(repository.count()).resolves.toBe(0);
  });

  test('deletes videos that still have committed ingest upload rows', async () => {
    const database = await createMigratedPrimarySqliteDatabase({ dbPath });
    const repository = new SqliteLibraryVideoMetadataRepository({ dbPath });

    await repository.create({
      createdAt: new Date('2026-03-24T00:00:00.000Z'),
      description: 'Uploaded fixture',
      duration: 58,
      genreSlugs: [],
      id: 'uploaded-video',
      sortIndex: 1,
      tags: ['qa'],
      title: 'Uploaded fixture',
      videoUrl: '/videos/uploaded-video/manifest.mpd',
    });
    await database.prepare(`
      INSERT INTO ingest_uploads (
        staging_id,
        reserved_video_id,
        committed_video_id,
        filename,
        mime_type,
        size_bytes,
        storage_relpath,
        status,
        created_at,
        updated_at,
        expires_at,
        committed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'staging-uploaded-video',
      'uploaded-video',
      'uploaded-video',
      'uploaded-video.mp4',
      'video/mp4',
      1024,
      'staging-uploaded-video/uploaded-video.mp4',
      'committed',
      '2026-03-24T00:00:00.000Z',
      '2026-03-24T00:00:00.000Z',
      '2026-03-25T00:00:00.000Z',
      '2026-03-24T00:00:01.000Z',
    );

    await expect(repository.delete('uploaded-video')).resolves.toBe(true);
    await expect(repository.findById('uploaded-video')).resolves.toBeNull();
    await expect(database.prepare<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM ingest_uploads
      WHERE committed_video_id = ?
    `).get('uploaded-video')).resolves.toEqual({ count: 0 });
  });

  test('lists active vocabulary rows without exposing inactive values', async () => {
    const database = await createMigratedPrimarySqliteDatabase({ dbPath });
    const repository = new SqliteLibraryVideoMetadataRepository({ dbPath });

    await database.prepare(`
      UPDATE video_genres SET active = 0 WHERE slug = ?
    `).run('animation');

    await expect(repository.listActiveContentTypes()).resolves.toEqual([
      { active: true, label: 'Movie', slug: 'movie', sortOrder: 10 },
      { active: true, label: 'Episode', slug: 'episode', sortOrder: 20 },
      { active: true, label: 'Home video', slug: 'home_video', sortOrder: 30 },
      { active: true, label: 'Clip', slug: 'clip', sortOrder: 40 },
      { active: true, label: 'Other', slug: 'other', sortOrder: 50 },
    ]);
    await expect(repository.listActiveGenres()).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: 'animation' }),
      ]),
    );
  });
});
