import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { SqliteActiveUploadCounterAdapter } from '~/modules/ingest/infrastructure/staging/sqlite-active-upload-counter.adapter';
import { SqliteLibraryVideoMetadataRepository } from '~/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository';
import { createInitializedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import { SqliteUserRepository } from '~/modules/user/infrastructure/sqlite/sqlite-user.repository';

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))),
);

async function fixture(
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled',
  stageStatus: 'uploaded' | 'committing' | 'committed' | 'removing',
  cleanupPending: number,
) {
  const root = await mkdtemp(path.join(tmpdir(), 'ingest-account-guard-'));
  roots.push(root);
  const dbPath = path.join(root, 'db.sqlite');
  const database = await createInitializedPrimarySqliteDatabase({ dbPath });
  const timestamp = '2026-11-02T00:00:00.000Z';
  await database
    .prepare(
      "INSERT INTO auth_users (id, username, username_key, password_hash, created_at) VALUES ('owner', 'owner', 'owner', 'test-hash', ?)",
    )
    .run(timestamp);
  if (stageStatus === 'committed') {
    await database
      .prepare(
        "INSERT INTO videos (id, title, duration_seconds, owner_id, visibility, created_at, updated_at, sort_index) VALUES ('video', 'Video', 1, 'owner', 'private', ?, ?, 1)",
      )
      .run(timestamp, timestamp);
  }
  await database
    .prepare(`INSERT INTO ingest_uploads (staging_id, owner_id, filename, mime_type, size_bytes, storage_relpath, status, created_at, updated_at, expires_at, committed_video_id, committed_at)
    VALUES ('stage', 'owner', 'video.mp4', 'video/mp4', 1, 'staging/stage/video.mp4', ?, ?, ?, ?, ?, ?)`)
    .run(
      stageStatus,
      timestamp,
      timestamp,
      timestamp,
      stageStatus === 'committed' ? 'video' : null,
      stageStatus === 'committed' ? timestamp : null,
    );
  await database
    .prepare(`INSERT INTO ingest_jobs (id, staging_id, owner_id, reserved_video_id, state, phase, metadata_json, request_hash, next_run_at, created_at, updated_at, finished_at, lease_token, lease_expires_at, source_cleanup_pending)
    VALUES ('job', 'stage', 'owner', 'video', ?, 'queued', ?, 'test-hash', 1, 1, 1, ?, ?, ?, ?)`)
    .run(
      state,
      JSON.stringify({ title: 'Video', tags: [], genreSlugs: [] }),
      state === 'queued' || state === 'running' ? null : 2,
      state === 'running' ? 'lease' : null,
      state === 'running' ? 90_000 : null,
      cleanupPending,
    );
  return { counter: new SqliteActiveUploadCounterAdapter({ dbPath }), database, dbPath };
}

describe('account deletion source and job guard', () => {
  test.each([
    ['queued', 'committing', 0, 1],
    ['running', 'committing', 0, 1],
    ['failed', 'uploaded', 0, 1],
    ['cancelled', 'uploaded', 0, 1],
    ['cancelled', 'removing', 0, 1],
    ['succeeded', 'committed', 1, 1],
    ['succeeded', 'committed', 0, 0],
  ] as const)(
    '%s/%s/cleanup%s counts exactly %s active source',
    async (state, source, cleanup, expected) => {
      const f = await fixture(state, source, cleanup);
      expect(await f.counter.countActiveUploads('owner')).toBe(expected);
      expect(await f.counter.countActiveUploads('another-account')).toBe(0);
    },
  );

  test('source-free completed history cascades with normal video deletion and never blocks later account deletion', async () => {
    const f = await fixture('succeeded', 'committed', 0);
    await f.database
      .prepare(
        "INSERT INTO playlists (id, owner_id, name, name_key, type, is_public, created_at, updated_at) VALUES ('playlist', 'owner', 'List', 'list', 'user_created', 0, ?, ?)",
      )
      .run('2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z');
    expect(await f.counter.countActiveUploads('owner')).toBe(0);
    expect(
      await new SqliteLibraryVideoMetadataRepository({ dbPath: f.dbPath }).delete('video'),
    ).toBe(true);
    expect(await f.counter.countActiveUploads('owner')).toBe(0);
    expect(await new SqliteUserRepository({ dbPath: f.dbPath }).deleteByUsernameKey('owner')).toBe(
      true,
    );
    expect(
      await f.database
        .prepare<{ count: number }>('SELECT COUNT(*) AS count FROM ingest_jobs')
        .get(),
    ).toEqual({ count: 0 });
    expect(
      await f.database.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM playlists').get(),
    ).toEqual({ count: 0 });
    expect(
      await f.database.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM auth_users').get(),
    ).toEqual({ count: 0 });
  });
});
