import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { SqliteOwnedVideoCounterAdapter } from './sqlite-owned-video-counter.adapter';

describe('SqliteOwnedVideoCounterAdapter', () => {
  let dbPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mediavault-owned-video-count-'));
    dbPath = join(tempDir, 'storage', 'db.sqlite');
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test('conservatively counts all videos before the owner_id schema slice exists', async () => {
    const database = await createMigratedPrimarySqliteDatabase({ dbPath });
    await database.prepare(`
      INSERT INTO videos (
        id,
        title,
        duration_seconds,
        created_at,
        updated_at,
        sort_index
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'video-without-owner',
      'Existing video',
      10,
      '2026-05-16T00:00:00.000Z',
      '2026-05-16T00:00:00.000Z',
      1,
    );

    const adapter = new SqliteOwnedVideoCounterAdapter({ dbPath });

    await expect(adapter.countOwnedVideos('user-1')).resolves.toBe(1);
  });

  test('counts by owner_id when the schema slice exists', async () => {
    const database = await createMigratedPrimarySqliteDatabase({ dbPath });
    await database.prepare(`
      ALTER TABLE videos ADD COLUMN owner_id TEXT
    `).run();
    await database.prepare(`
      INSERT INTO videos (
        id,
        title,
        duration_seconds,
        created_at,
        updated_at,
        sort_index,
        owner_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'video-1',
      'Owned video',
      10,
      '2026-05-16T00:00:00.000Z',
      '2026-05-16T00:00:00.000Z',
      1,
      'user-1',
    );
    await database.prepare(`
      INSERT INTO videos (
        id,
        title,
        duration_seconds,
        created_at,
        updated_at,
        sort_index,
        owner_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'video-2',
      'Other video',
      10,
      '2026-05-16T00:00:00.000Z',
      '2026-05-16T00:00:00.000Z',
      2,
      'user-2',
    );

    const adapter = new SqliteOwnedVideoCounterAdapter({ dbPath });

    await expect(adapter.countOwnedVideos('user-1')).resolves.toBe(1);
    await expect(adapter.countOwnedVideos('user-2')).resolves.toBe(1);
    await expect(adapter.countOwnedVideos('missing')).resolves.toBe(0);
  });
});
