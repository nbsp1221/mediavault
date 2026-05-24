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

  test('counts videos by required owner_id', async () => {
    const database = await createMigratedPrimarySqliteDatabase({ dbPath });
    await database.prepare(`
      INSERT INTO auth_users (id, username, username_key, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)
    `).run(
      'user-1',
      'Owner One',
      'owner-one',
      'test-password-hash',
      'user',
      '2026-05-16T00:00:00.000Z',
      'user-2',
      'Owner Two',
      'owner-two',
      'test-password-hash',
      'user',
      '2026-05-16T00:00:00.000Z',
    );
    await database.prepare(`
      INSERT INTO videos (
        id,
        title,
        duration_seconds,
        owner_id,
        visibility,
        created_at,
        updated_at,
        sort_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'video-1',
      'Owned video',
      10,
      'user-1',
      'private',
      '2026-05-16T00:00:00.000Z',
      '2026-05-16T00:00:00.000Z',
      1,
    );
    await database.prepare(`
      INSERT INTO videos (
        id,
        title,
        duration_seconds,
        owner_id,
        visibility,
        created_at,
        updated_at,
        sort_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'video-2',
      'Other video',
      10,
      'user-2',
      'public',
      '2026-05-16T00:00:00.000Z',
      '2026-05-16T00:00:00.000Z',
      2,
    );

    const adapter = new SqliteOwnedVideoCounterAdapter({ dbPath });

    await expect(adapter.countOwnedVideos('user-1')).resolves.toBe(1);
    await expect(adapter.countOwnedVideos('user-2')).resolves.toBe(1);
    await expect(adapter.countOwnedVideos('missing')).resolves.toBe(0);
  });
});
