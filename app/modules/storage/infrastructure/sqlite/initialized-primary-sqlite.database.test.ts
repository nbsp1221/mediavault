import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { TEST_DATABASE_ENCRYPTION_KEY } from '../../../../../tests/support/database-encryption-key';
import type {
  PrimarySqliteDatabaseAdapter,
  SqliteDatabaseAdapter,
} from './primary-sqlite.database';
import {
  PRIMARY_STORAGE_APPLICATION_ID,
  PRIMARY_STORAGE_FORMAT_VERSION,
  createInitializedPrimarySqliteDatabase,
} from './initialized-primary-sqlite.database';
import { createPrimarySqliteDatabase } from './primary-sqlite.database';

const roots: string[] = [];
const connections: PrimarySqliteDatabaseAdapter[] = [];
const now = '2026-11-02T00:00:00.000Z';

async function createPath() {
  const root = await mkdtemp(path.join(tmpdir(), 'mediavault-fresh-schema-'));
  roots.push(root);
  return path.join(root, 'storage', 'db.sqlite');
}

async function open(dbPath: string, raw = false) {
  const create = raw ? createPrimarySqliteDatabase : createInitializedPrimarySqliteDatabase;
  const database = await create({ dbPath, encryptionKey: TEST_DATABASE_ENCRYPTION_KEY });
  connections.push(database);
  return database;
}

async function fixture() {
  const dbPath = await createPath();
  return { database: await open(dbPath), dbPath };
}

async function names(database: SqliteDatabaseAdapter) {
  return database
    .prepare<{ name: string }>(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name",
    )
    .all();
}

async function seedUser(database: SqliteDatabaseAdapter, id = 'owner') {
  await database
    .prepare(
      'INSERT INTO auth_users (id, username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, id, id, 'fixture-hash', now);
}

async function seedVideo(database: SqliteDatabaseAdapter, id: string, index: number) {
  await database
    .prepare(
      'INSERT INTO videos (id, title, duration_seconds, owner_id, visibility, created_at, updated_at, sort_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, id, 10.5, 'owner', 'private', now, now, index);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(connections.splice(0).map((database) => database.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('fresh primary storage initialization', () => {
  test('creates the current complete encrypted schema and vocabulary atomically without migration history', async () => {
    const { database, dbPath } = await fixture();
    expect((await names(database)).map((row) => row.name)).toEqual([
      'auth_sessions',
      'auth_users',
      'ingest_jobs',
      'ingest_uploads',
      'playlist_items',
      'playlists',
      'tags',
      'video_content_types',
      'video_genre_assignments',
      'video_genres',
      'video_media_assets',
      'video_tags',
      'videos',
    ]);
    await expect(database.prepare('PRAGMA application_id').get()).resolves.toEqual({
      application_id: PRIMARY_STORAGE_APPLICATION_ID,
    });
    await expect(database.prepare('PRAGMA user_version').get()).resolves.toEqual({
      user_version: PRIMARY_STORAGE_FORMAT_VERSION,
    });
    expect(
      (await database.prepare<{ name: string }>('PRAGMA table_info(auth_users)').all()).map(
        (row) => row.name,
      ),
    ).not.toContain('role');
    expect(
      (await database.prepare<{ name: string }>('PRAGMA table_info(auth_sessions)').all()).map(
        (row) => row.name,
      ),
    ).toContain('user_id');
    await expect(
      database.prepare('SELECT slug FROM video_content_types WHERE slug = ?').get('clip'),
    ).resolves.toEqual({ slug: 'clip' });
    await expect(
      database.prepare('SELECT slug FROM video_genres WHERE slug = ?').get('action'),
    ).resolves.toEqual({ slug: 'action' });
    await expect(database.prepare('PRAGMA foreign_key_check').all()).resolves.toEqual([]);
    await expect(database.prepare('PRAGMA integrity_check').get()).resolves.toEqual({
      integrity_check: 'ok',
    });
    await database.close();
    expect((await readFile(dbPath)).subarray(0, 16).toString()).not.toBe('SQLite format 3\0');
  });

  test('reopens idempotently without resetting sessions or overwriting/reseeding vocabulary', async () => {
    const { database, dbPath } = await fixture();
    await seedUser(database);
    await database
      .prepare(
        'INSERT INTO auth_sessions (id, user_id, created_at, expires_at, last_accessed_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('session', 'owner', now, now, now);
    await database
      .prepare('UPDATE video_content_types SET label = ? WHERE slug = ?')
      .run('Custom label', 'clip');
    await database.prepare('DELETE FROM video_genres WHERE slug = ?').run('action');
    await database.close();
    const reopened = await open(dbPath);
    await expect(reopened.prepare('SELECT id FROM auth_sessions').all()).resolves.toEqual([
      { id: 'session' },
    ]);
    await expect(
      reopened.prepare('SELECT label FROM video_content_types WHERE slug = ?').get('clip'),
    ).resolves.toEqual({ label: 'Custom label' });
    await expect(
      reopened.prepare('SELECT slug FROM video_genres WHERE slug = ?').get('action'),
    ).resolves.toBeUndefined();
    await expect(
      reopened.prepare('INSERT INTO video_tags VALUES (?, ?)').run('missing-video', 'missing-tag'),
    ).rejects.toThrow('FOREIGN KEY');
    await expect(
      createInitializedPrimarySqliteDatabase({ dbPath, encryptionKey: 'incorrect-key' }),
    ).rejects.toThrow();
  });

  test('serializes concurrent cold starts and seeds each vocabulary row once', async () => {
    const dbPath = await createPath();
    const databases = await Promise.all(Array.from({ length: 8 }, () => open(dbPath)));
    for (const database of databases) {
      await expect(
        database
          .prepare('SELECT count(*) AS count FROM video_content_types WHERE slug = ?')
          .get('clip'),
      ).resolves.toEqual({ count: 1 });
      await expect(
        database.prepare('SELECT count(*) AS count FROM video_genres WHERE slug = ?').get('action'),
      ).resolves.toEqual({ count: 1 });
    }
  });

  test.each([
    [0, 1],
    [PRIMARY_STORAGE_APPLICATION_ID, 2],
    [PRIMARY_STORAGE_APPLICATION_ID, -1],
    [1234, 0],
    [1234, 1],
  ])(
    'rejects unsupported identity/version without changing existing data (%i/%i)',
    async (applicationId, version) => {
      const dbPath = await createPath();
      const database = await open(dbPath, true);
      await database.exec(
        `CREATE TABLE retained_data (value TEXT); INSERT INTO retained_data VALUES ('retain-me'); PRAGMA application_id = ${applicationId}; PRAGMA user_version = ${version}`,
      );
      await expect(open(dbPath)).rejects.toThrow('Unsupported');
      await expect(database.prepare('SELECT * FROM retained_data').all()).resolves.toEqual([
        { value: 'retain-me' },
      ]);
      await expect(database.prepare('PRAGMA application_id').get()).resolves.toEqual({
        application_id: applicationId,
      });
      await expect(database.prepare('PRAGMA user_version').get()).resolves.toEqual({
        user_version: version,
      });
    },
  );

  test.each(['retained_data', 'sqlitex_not_internal'])(
    'rejects nonempty unmarked databases rather than adopting them (%s)',
    async (table) => {
      const dbPath = await createPath();
      const database = await open(dbPath, true);
      await database.exec(
        `CREATE TABLE ${table} (value TEXT); INSERT INTO ${table} VALUES ('retain-me')`,
      );
      await expect(open(dbPath)).rejects.toThrow('nonempty');
      await expect(names(database)).resolves.toEqual([{ name: table }]);
      await expect(database.prepare(`SELECT * FROM ${table}`).all()).resolves.toEqual([
        { value: 'retain-me' },
      ]);
    },
  );

  test('rejects an incomplete schema with a forged current format marker', async () => {
    const dbPath = await createPath();
    const database = await open(dbPath, true);
    await database.exec(
      `CREATE TABLE retained_data (value TEXT); PRAGMA application_id = ${PRIMARY_STORAGE_APPLICATION_ID}; PRAGMA user_version = ${PRIMARY_STORAGE_FORMAT_VERSION}`,
    );
    await expect(open(dbPath)).rejects.toThrow('does not match');
    await expect(names(database)).resolves.toEqual([{ name: 'retained_data' }]);
  });

  test('rolls back all schema, seeds, and format markers if final initialization fails, allowing a clean retry', async () => {
    const dbPath = await createPath();
    // oxlint-disable-next-line typescript/unbound-method -- The injector calls the original with the native receiver.
    const execute = Database.prototype.exec;
    const spy = vi.spyOn(Database.prototype, 'exec').mockImplementation(function (
      this: Database.Database,
      sql,
    ) {
      const result = execute.call(this, sql);
      if (sql.startsWith('PRAGMA application_id =')) {
        throw new Error('Injected final initialization I/O failure');
      }
      return result;
    });
    await expect(open(dbPath)).rejects.toThrow('Injected final initialization');
    spy.mockRestore();
    const raw = await open(dbPath, true);
    await expect(names(raw)).resolves.toEqual([]);
    await expect(raw.prepare('PRAGMA application_id').get()).resolves.toEqual({
      application_id: 0,
    });
    await expect(raw.prepare('PRAGMA user_version').get()).resolves.toEqual({ user_version: 0 });
    await raw.close();
    const initialized = await open(dbPath);
    await expect(
      initialized.prepare('SELECT slug FROM video_content_types WHERE slug = ?').get('clip'),
    ).resolves.toEqual({ slug: 'clip' });
  });

  test('retains roleless account/session, ownership, identifier, taxonomy, and playlist constraints', async () => {
    const { database } = await fixture();
    await seedUser(database);
    await seedVideo(database, 'video-a', 1);
    await seedVideo(database, 'video-b', 2);
    const videoInsert = database.prepare(
      'INSERT INTO videos (id, title, duration_seconds, owner_id, visibility, created_at, updated_at, sort_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    await expect(
      videoInsert.run('..', 'Unsafe', 1, 'owner', 'private', now, now, 3),
    ).rejects.toThrow();
    await expect(
      videoInsert.run('missing-owner', 'Orphan', 1, 'missing', 'private', now, now, 3),
    ).rejects.toThrow('FOREIGN KEY');
    await expect(
      videoInsert.run('bad-visibility', 'Invalid', 1, 'owner', 'restricted', now, now, 3),
    ).rejects.toThrow();
    await expect(
      videoInsert.run('negative-duration', 'Invalid', -1, 'owner', 'public', now, now, 3),
    ).rejects.toThrow();
    for (const table of ['video_content_types', 'video_genres']) {
      await expect(
        database
          .prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?)`)
          .run('../unsafe', 'Unsafe', 0, 999),
      ).rejects.toThrow();
    }
    const users = database.prepare(
      'INSERT INTO auth_users (id, username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    await expect(users.run('another', 'OWNER', 'owner', 'hash', now)).rejects.toThrow();
    await expect(users.run('unsafe-user', 'Unsafe', '../unsafe', 'hash', now)).rejects.toThrow();
    const sessions = database.prepare(
      'INSERT INTO auth_sessions (id, user_id, created_at, expires_at, is_revoked, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    await expect(sessions.run('bad-boolean', 'owner', now, now, 2, now)).rejects.toThrow();
    await expect(sessions.run('missing-user', 'missing', now, now, 0, now)).rejects.toThrow(
      'FOREIGN KEY',
    );
    await sessions.run('session', 'owner', now, now, 0, now);
    await database.prepare('INSERT INTO tags VALUES (?, ?, ?)').run('tag', 'Tag', now);
    await database.prepare('INSERT INTO video_tags VALUES (?, ?)').run('video-a', 'tag');
    await expect(
      database.prepare('INSERT INTO video_tags VALUES (?, ?)').run('video-a', 'tag'),
    ).rejects.toThrow();
    const playlists = database.prepare(
      'INSERT INTO playlists (id, owner_id, name, name_key, type, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    await playlists.run('playlist', 'owner', 'Favorites', 'favorites', 'manual', 0, now, now);
    await expect(
      playlists.run('duplicate', 'owner', 'FAVORITES', 'favorites', 'manual', 0, now, now),
    ).rejects.toThrow();
    await playlists.run('other-owner', 'other', 'Favorites', 'favorites', 'manual', 0, now, now);
    await expect(
      playlists.run('bad-boolean', 'owner', 'Bad', 'bad', 'manual', 2, now, now),
    ).rejects.toThrow();
    const items = database.prepare(
      'INSERT INTO playlist_items (playlist_id, video_id, position, added_at, added_by) VALUES (?, ?, ?, ?, ?)',
    );
    await items.run('playlist', 'video-a', 0, now, 'owner');
    await expect(items.run('playlist', 'video-a', 1, now, 'owner')).rejects.toThrow();
    await expect(items.run('playlist', 'video-b', 0, now, 'owner')).rejects.toThrow();
    await expect(items.run('playlist', 'video-b', -1, now, 'owner')).rejects.toThrow();
    await expect(
      database
        .prepare('UPDATE playlists SET metadata_json = ? WHERE id = ?')
        .run('invalid-json', 'playlist'),
    ).rejects.toThrow();
  });

  test('enforces positive/negative media asset readiness and path contracts', async () => {
    const { database } = await fixture();
    await seedUser(database);
    for (const [index, id] of ['ready', 'failed', 'preparing', 'invalid'].entries()) {
      await seedVideo(database, id, index);
    }
    const assets = database.prepare(
      'INSERT INTO video_media_assets (video_id, layout_version, status, preparation_strategy) VALUES (?, ?, ?, ?)',
    );
    await expect(assets.run('invalid', 1, 'ready', 'copy')).rejects.toThrow();
    await expect(assets.run('invalid', 1, 'failed', 'copy')).rejects.toThrow();
    await expect(assets.run('invalid', 1, 'unknown', 'copy')).rejects.toThrow();
    await expect(assets.run('invalid', 0, 'preparing', 'copy')).rejects.toThrow();
    await assets.run('preparing', 1, 'preparing', 'copy');
    await database
      .prepare(
        'INSERT INTO video_media_assets (video_id, layout_version, status, preparation_strategy, failed_at, failure_message) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('failed', 1, 'failed', 'copy', now, 'Probe failed');
    await database
      .prepare(
        `INSERT INTO video_media_assets (video_id, layout_version, status, preparation_strategy, manifest_relpath, key_relpath, thumbnail_relpath, video_init_relpath, video_segment_glob, audio_init_relpath, audio_segment_glob, prepared_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'ready',
        1,
        'ready',
        'copy',
        'manifest.mpd',
        'key.bin',
        'thumbnail.jpg',
        'video/init.mp4',
        'video/segment-*.m4s',
        'audio/init.mp4',
        'audio/segment-*.m4s',
        now,
      );
    for (const column of [
      'manifest_relpath',
      'key_relpath',
      'thumbnail_relpath',
      'video_init_relpath',
      'video_segment_glob',
      'audio_init_relpath',
      'audio_segment_glob',
    ]) {
      for (const invalidPath of ['', '../outside', '/absolute', 'a\\b', `bad\0path`]) {
        await expect(
          database
            .prepare(`UPDATE video_media_assets SET ${column} = ? WHERE video_id = ?`)
            .run(invalidPath, 'ready'),
        ).rejects.toThrow();
      }
      await expect(
        database
          .prepare(`UPDATE video_media_assets SET ${column} = NULL WHERE video_id = ?`)
          .run('ready'),
      ).rejects.toThrow();
    }
    await expect(
      database
        .prepare('UPDATE video_media_assets SET prepared_at = NULL WHERE video_id = ?')
        .run('ready'),
    ).rejects.toThrow();
  });

  test('retains upload owner RESTRICT, removing state, committed history and failure field constraints', async () => {
    const { database } = await fixture();
    await seedUser(database);
    await seedUser(database, 'stage-owner');
    await seedVideo(database, 'published', 1);
    const insert = database.prepare(
      'INSERT INTO ingest_uploads (staging_id, owner_id, filename, mime_type, size_bytes, storage_relpath, status, created_at, updated_at, expires_at, committed_video_id, committed_at, failure_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    await insert.run(
      'pending',
      'stage-owner',
      'video.mp4',
      'video/mp4',
      1,
      'staging/pending/source',
      'uploaded',
      now,
      now,
      now,
      null,
      null,
      null,
    );
    await database
      .prepare('UPDATE ingest_uploads SET status = ? WHERE staging_id = ?')
      .run('removing', 'pending');
    await expect(
      database.prepare('DELETE FROM auth_users WHERE id = ?').run('stage-owner'),
    ).rejects.toThrow('FOREIGN KEY');
    await insert.run(
      'committed',
      'stage-owner',
      'video.mp4',
      'video/mp4',
      1,
      'staging/committed/source',
      'committed',
      now,
      now,
      now,
      'published',
      now,
      null,
    );
    await expect(
      database.prepare('DELETE FROM videos WHERE id = ?').run('published'),
    ).rejects.toThrow('FOREIGN KEY');
    await expect(
      insert.run(
        'orphan',
        'missing',
        'video.mp4',
        'video/mp4',
        1,
        'staging/orphan/source',
        'uploaded',
        now,
        now,
        now,
        null,
        null,
        null,
      ),
    ).rejects.toThrow('FOREIGN KEY');
    await expect(
      insert.run(
        'unknown',
        'stage-owner',
        'video.mp4',
        'video/mp4',
        1,
        'staging/unknown/source',
        'unknown',
        now,
        now,
        now,
        null,
        null,
        null,
      ),
    ).rejects.toThrow();
    await expect(
      insert.run(
        'failed',
        'stage-owner',
        'video.mp4',
        'video/mp4',
        1,
        'staging/failed/source',
        'failed',
        now,
        now,
        now,
        null,
        null,
        null,
      ),
    ).rejects.toThrow();
    await expect(
      insert.run(
        'bad-commit',
        'stage-owner',
        'video.mp4',
        'video/mp4',
        1,
        'staging/bad-commit/source',
        'committed',
        now,
        now,
        now,
        null,
        null,
        null,
      ),
    ).rejects.toThrow();
    await expect(
      insert.run(
        'bad-upload',
        'stage-owner',
        'video.mp4',
        'video/mp4',
        1,
        'staging/bad-upload/source',
        'uploaded',
        now,
        now,
        now,
        'published',
        now,
        null,
      ),
    ).rejects.toThrow();
    await expect(
      insert.run(
        'bad-message',
        'stage-owner',
        'video.mp4',
        'video/mp4',
        1,
        'staging/bad-message/source',
        'uploaded',
        now,
        now,
        now,
        null,
        null,
        'Unexpected',
      ),
    ).rejects.toThrow();
    await insert.run(
      'failed-valid',
      'stage-owner',
      'video.mp4',
      'video/mp4',
      1,
      'staging/failed-valid/source',
      'failed',
      now,
      now,
      now,
      null,
      null,
      'Expected failure',
    );
  });
});
