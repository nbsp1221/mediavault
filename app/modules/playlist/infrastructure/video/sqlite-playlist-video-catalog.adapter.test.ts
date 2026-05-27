import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createVideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import { SqliteLibraryVideoMetadataRepository } from '~/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository';
import { createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { SqlitePlaylistVideoCatalog } from './sqlite-playlist-video-catalog.adapter';

describe('SqlitePlaylistVideoCatalog', () => {
  let dbPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'local-streamer-playlist-video-catalog-'));
    dbPath = join(tempDir, 'db.sqlite');
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test('resolves public videos for anonymous playlist reads', async () => {
    await seedVideo({
      id: 'public-video',
      ownerId: 'owner-1',
      title: 'Public video',
      visibility: 'public',
    });
    const catalog = new SqlitePlaylistVideoCatalog({ dbPath });

    await expect(catalog.findById('public-video', createVideoReadAccessScope({
      type: 'anonymous',
    }))).resolves.toEqual({
      duration: 60,
      id: 'public-video',
      thumbnailUrl: '/api/thumbnail/public-video',
      title: 'Public video',
    });
  });

  test('resolves private videos only for the owner read scope', async () => {
    await seedVideo({
      id: 'private-video',
      ownerId: 'owner-1',
      title: 'Private video',
      visibility: 'private',
    });
    const catalog = new SqlitePlaylistVideoCatalog({ dbPath });

    await expect(catalog.findById('private-video', createVideoReadAccessScope({
      type: 'authenticated',
      userId: 'owner-1',
    }))).resolves.toEqual(expect.objectContaining({
      id: 'private-video',
      title: 'Private video',
    }));
    await expect(catalog.findById('private-video', createVideoReadAccessScope({
      type: 'authenticated',
      userId: 'owner-2',
    }))).resolves.toBeNull();
  });

  test('omits videos whose media assets are not ready', async () => {
    await seedVideo({
      id: 'processing-video',
      mediaStatus: 'preparing',
      ownerId: 'owner-1',
      title: 'Processing video',
      visibility: 'public',
    });
    const catalog = new SqlitePlaylistVideoCatalog({ dbPath });

    await expect(catalog.findById('processing-video', createVideoReadAccessScope({
      type: 'anonymous',
    }))).resolves.toBeNull();
  });

  async function seedVideo(input: {
    id: string;
    mediaStatus?: 'preparing' | 'ready';
    ownerId: string;
    title: string;
    visibility: 'private' | 'public';
  }) {
    const repository = new SqliteLibraryVideoMetadataRepository({ dbPath });
    const database = await createMigratedPrimarySqliteDatabase({ dbPath });
    await seedOwner(database, input.ownerId);

    await repository.create({
      contentTypeSlug: 'movie',
      createdAt: new Date('2026-05-27T00:00:00.000Z'),
      description: input.title,
      duration: 60,
      genreSlugs: [],
      id: input.id,
      ownerId: input.ownerId,
      sortIndex: 1,
      tags: ['playlist'],
      thumbnailUrl: `/api/thumbnail/${input.id}`,
      title: input.title,
      videoUrl: `/videos/${input.id}/manifest.mpd`,
      visibility: input.visibility,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.mediaStatus ?? 'ready',
      1,
      'fixture',
      `${input.id}/manifest.mpd`,
      `${input.id}/key.bin`,
      `${input.id}/thumbnail.jpg`,
      `${input.id}/video/init.mp4`,
      `${input.id}/video/segment-*.m4s`,
      `${input.id}/audio/init.mp4`,
      `${input.id}/audio/segment-*.m4s`,
      '2026-05-27T00:00:00.000Z',
    );
  }
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
