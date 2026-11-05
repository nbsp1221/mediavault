import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { parseIngestJobMetadata } from '~/modules/ingest/application/use-cases/manage-ingest-jobs.usecase';
import { createInitializedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import { ingestJobSchemaSql } from './ingest-job-schema.sql';
import { SqliteIngestJobRepository } from './sqlite-ingest-job.repository';

const roots: string[] = [];
const now = Date.parse('2026-11-02T12:00:00Z');
const metadata = parseIngestJobMetadata({
  title: 'Video',
  tags: ['Some Tag'],
  genreSlugs: ['drama'],
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ingest-job-repository-'));
  roots.push(root);
  const database = await createInitializedPrimarySqliteDatabase({
    dbPath: path.join(root, 'db.sqlite'),
    encryptionKey: 'isolated-ingest-job-test-key',
  });
  await database.exec(ingestJobSchemaSql);
  for (const userId of ['owner-a', 'owner-b']) {
    await database
      .prepare(
        'INSERT INTO auth_users (id, username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(userId, userId, userId, 'test-only-hash', new Date(now).toISOString());
  }
  const promoteArtifacts = vi.fn(async () => undefined);
  const repository = new SqliteIngestJobRepository({
    database,
    promoteArtifacts,
    storageDir: root,
  });

  const stage = async (id = 'stage-a', owner = 'owner-a', expiresAt = now + 86_400_000) => {
    await database
      .prepare(`INSERT INTO ingest_uploads (staging_id, owner_id, filename, mime_type, size_bytes, storage_relpath, status, created_at, updated_at, expires_at)
      VALUES (?, ?, 'video.mp4', 'video/mp4', 10, ?, 'uploaded', ?, ?, ?)`)
      .run(
        id,
        owner,
        `uploads/${id}/video.mp4`,
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(expiresAt).toISOString(),
      );
  };

  const enqueue = async (
    id = 'job-a',
    stagingId = 'stage-a',
    ownerId = 'owner-a',
    hash = metadata.requestHash,
    capacity = 21,
  ) =>
    repository.enqueue({
      ...metadata,
      capacity,
      id,
      now,
      ownerId,
      requestHash: hash,
      stagingId,
      videoId: `video-${id}`,
    });

  await stage();
  return { database, enqueue, promoteArtifacts, repository, root, stage };
}

describe('persisted SQLite ingest jobs', () => {
  test('accepts once, pins stage and reserves stable video identity in one transaction', async () => {
    const f = await fixture();
    const [first, replay] = await Promise.all([f.enqueue(), f.enqueue('duplicate')]);
    expect(first).toMatchObject({
      kind: 'accepted',
      job: { id: 'job-a', state: 'queued', videoId: 'video-job-a' },
    });
    expect(replay).toMatchObject({
      kind: 'accepted',
      job: { id: 'job-a', videoId: 'video-job-a' },
    });
    expect(
      await f.database.prepare('SELECT status, reserved_video_id FROM ingest_uploads').get(),
    ).toMatchObject({ status: 'committing', reserved_video_id: 'video-job-a' });
    expect(await f.enqueue('other', 'stage-a', 'owner-a', 'changed-body')).toEqual({
      kind: 'conflict',
    });
  });

  test('rejects missing, other-owner, expired and non-uploaded stages without accepting work', async () => {
    const f = await fixture();
    expect(await f.enqueue('x', 'missing')).toEqual({ kind: 'missing' });
    expect(await f.enqueue('x', 'stage-a', 'owner-b')).toEqual({ kind: 'missing' });
    await f.stage('expired', 'owner-a', now);
    expect(await f.enqueue('x', 'expired')).toEqual({ kind: 'expired' });
    await f.database
      .prepare("UPDATE ingest_uploads SET status = 'committing' WHERE staging_id = 'stage-a'")
      .run();
    expect(await f.enqueue()).toEqual({ kind: 'conflict' });
    expect(await f.repository.hasActiveJobs('owner-a')).toBe(false);
  });

  test('bounds new admission but replays existing acceptance when full', async () => {
    const f = await fixture();
    await f.enqueue();
    await f.stage('stage-b');
    expect(await f.enqueue('job-b', 'stage-b', 'owner-a', metadata.requestHash, 1)).toEqual({
      kind: 'full',
    });
    expect(await f.enqueue('replay', 'stage-a', 'owner-a', metadata.requestHash, 1)).toMatchObject({
      kind: 'accepted',
      job: { id: 'job-a' },
    });
  });

  test('ownership scopes list/detail and cancellation without exposing worker or file data through the view', async () => {
    const f = await fixture();
    await f.enqueue();
    expect(await f.repository.findOwned('job-a', 'owner-b')).toBeNull();
    expect(await f.repository.listOwned('owner-b', { limit: 50, offset: 0 })).toEqual([]);
    expect(
      await f.repository.requestCancellation({ id: 'job-a', ownerId: 'owner-b', now }),
    ).toEqual({ kind: 'missing' });
    expect(await f.repository.hasActiveJobs('owner-a')).toBe(true);
    expect(await f.repository.listOwned('owner-a', { limit: 1, offset: 0 })).toHaveLength(1);
    expect(await f.repository.listOwned('owner-a', { limit: 1, offset: 1 })).toHaveLength(0);
  });

  test('competing independent database connections only claim one lease', async () => {
    const f = await fixture();
    await f.enqueue();
    const otherDatabase = await createInitializedPrimarySqliteDatabase({
      dbPath: path.join(f.root, 'db.sqlite'),
      encryptionKey: 'isolated-ingest-job-test-key',
    });
    const other = new SqliteIngestJobRepository({
      database: otherDatabase,
      promoteArtifacts: f.promoteArtifacts,
      storageDir: f.root,
    });
    const claims = await Promise.all([
      f.repository.claim({ leaseMs: 90_000, leaseToken: 'lease-a', now }),
      other.claim({ leaseMs: 90_000, leaseToken: 'lease-b', now }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)).toMatchObject({ attemptCount: 1, state: 'running' });
  });

  test('heartbeats renew ownership, cancellation is observed and stale tokens cannot publish', async () => {
    const f = await fixture();
    await f.enqueue();
    await f.repository.claim({ leaseMs: 1_000, leaseToken: 'lease-a', now });
    expect(
      await f.repository.heartbeat({ id: 'job-a', leaseToken: 'wrong', leaseMs: 1_000, now }),
    ).toBe('lost');
    expect(
      await f.repository.heartbeat({
        id: 'job-a',
        leaseToken: 'lease-a',
        leaseMs: 1_000,
        now: now + 500,
        phase: 'packaging',
      }),
    ).toBe('renewed');
    await f.repository.requestCancellation({ id: 'job-a', ownerId: 'owner-a', now: now + 600 });
    expect(
      await f.repository.heartbeat({
        id: 'job-a',
        leaseToken: 'lease-a',
        leaseMs: 1_000,
        now: now + 700,
      }),
    ).toBe('cancelled');
    expect(
      await f.repository.publish({
        id: 'job-a',
        leaseToken: 'lease-a',
        now: now + 700,
        prepared: { duration: 1, strategy: 'remux', workspacePath: '/unused' },
      }),
    ).toBe(false);
    expect(f.promoteArtifacts).not.toHaveBeenCalled();
    expect(
      await f.repository.cancelAttempt({ id: 'job-a', leaseToken: 'lease-a', now: now + 700 }),
    ).toBe(true);
    expect(await f.repository.findOwned('job-a', 'owner-a')).toMatchObject({
      state: 'cancelled',
      leaseToken: null,
    });
  });

  test('expired ownership is retried after delay and old owner is fenced out', async () => {
    const f = await fixture();
    await f.enqueue();
    await f.repository.claim({ leaseMs: 1_000, leaseToken: 'old', now });
    await f.repository.recoverExpired(now + 1_000);
    expect(
      await f.repository.claim({ leaseMs: 1_000, leaseToken: 'new', now: now + 2_000 }),
    ).toBeNull();
    expect(
      await f.repository.claim({ leaseMs: 1_000, leaseToken: 'new', now: now + 6_000 }),
    ).toMatchObject({ attemptCount: 2, leaseToken: 'new' });
    expect(
      await f.repository.fail({
        id: 'job-a',
        leaseToken: 'old',
        now: now + 6_001,
        code: 'FAIL',
        message: 'Old failure',
      }),
    ).toBe(false);
  });

  test('repeated crashes exhaust automatic budget and expired cancellation does not restart', async () => {
    const f = await fixture();
    await f.enqueue();
    for (let index = 0; index < 3; index++) {
      const time = now + index * 6_000;
      await f.repository.claim({ leaseMs: 1_000, leaseToken: `lease-${index}`, now: time });
      await f.repository.recoverExpired(time + 1_000);
    }
    expect(await f.repository.findOwned('job-a', 'owner-a')).toMatchObject({
      state: 'failed',
      attemptCount: 3,
    });
    await f.repository.retry({ id: 'job-a', ownerId: 'owner-a', now: now + 20_000 });
    await f.repository.claim({ leaseMs: 1_000, leaseToken: 'cancel', now: now + 20_000 });
    await f.repository.requestCancellation({ id: 'job-a', ownerId: 'owner-a', now: now + 20_500 });
    await f.repository.recoverExpired(now + 21_000);
    expect(await f.repository.findOwned('job-a', 'owner-a')).toMatchObject({ state: 'cancelled' });
  });

  test('publication atomically writes one private ready video, assets, stage and succeeded job', async () => {
    const f = await fixture();
    await f.enqueue();
    await f.repository.claim({ leaseMs: 90_000, leaseToken: 'lease', now });
    expect(
      await f.repository.publish({
        id: 'job-a',
        leaseToken: 'lease',
        now,
        prepared: { duration: 12, strategy: 'preserve', workspacePath: '/private/attempt' },
      }),
    ).toBe(true);
    expect(f.promoteArtifacts).toHaveBeenCalledOnce();
    expect(
      await f.database.prepare('SELECT owner_id, visibility, title FROM videos').get(),
    ).toMatchObject({ owner_id: 'owner-a', visibility: 'private', title: 'Video' });
    expect(await f.database.prepare('SELECT status FROM video_media_assets').get()).toMatchObject({
      status: 'ready',
    });
    expect(await f.database.prepare('SELECT tag_slug FROM video_tags').get()).toMatchObject({
      tag_slug: 'some tag',
    });
    expect(
      await f.database.prepare('SELECT genre_slug FROM video_genre_assignments').get(),
    ).toMatchObject({ genre_slug: 'drama' });
    expect(await f.repository.nextSourceCleanup()).toMatchObject({
      id: 'job-a',
      state: 'succeeded',
    });
    await f.repository.acknowledgeSourceCleanup('job-a');
    expect(await f.repository.nextSourceCleanup()).toBeNull();
    expect(await f.enqueue('repeat')).toMatchObject({
      kind: 'accepted',
      job: { videoId: 'video-job-a', state: 'succeeded' },
    });
    expect(
      await f.repository.requestCancellation({ id: 'job-a', ownerId: 'owner-a', now }),
    ).toEqual({ kind: 'conflict' });
    expect(await f.repository.retry({ id: 'job-a', ownerId: 'owner-a', now })).toEqual({
      kind: 'conflict',
    });
  });

  test('publication failure after promotion rolls back every SQL projection, retaining retryable input', async () => {
    const f = await fixture();
    await f.enqueue();
    await f.repository.claim({ leaseMs: 90_000, leaseToken: 'lease', now });
    await f.database.exec(
      "CREATE TRIGGER fail_publication BEFORE UPDATE ON ingest_uploads WHEN NEW.status = 'committed' BEGIN SELECT RAISE(ABORT, 'injected publication failure'); END",
    );
    await expect(
      f.repository.publish({
        id: 'job-a',
        leaseToken: 'lease',
        now,
        prepared: { duration: 12, strategy: 'preserve', workspacePath: '/attempt' },
      }),
    ).rejects.toThrow();
    expect(f.promoteArtifacts).toHaveBeenCalledOnce();
    expect(await f.database.prepare('SELECT COUNT(*) AS count FROM videos').get()).toMatchObject({
      count: 0,
    });
    expect(await f.database.prepare('SELECT status FROM ingest_uploads').get()).toMatchObject({
      status: 'committing',
    });
    expect(await f.repository.findOwned('job-a', 'owner-a')).toMatchObject({
      state: 'running',
      sourceCleanupPending: false,
    });
  });

  test('queued cancellation prevents spawning and explicit retry preserves identity with revised metadata', async () => {
    const f = await fixture();
    await f.enqueue();
    expect(
      await f.repository.requestCancellation({ id: 'job-a', ownerId: 'owner-a', now }),
    ).toMatchObject({ kind: 'updated', job: { state: 'cancelled' } });
    expect(await f.repository.claim({ leaseMs: 90_000, leaseToken: 'lease', now })).toBeNull();
    const revised = parseIngestJobMetadata({ title: 'Revised' });
    expect(
      await f.repository.retry({ ...revised, id: 'job-a', ownerId: 'owner-a', now }),
    ).toMatchObject({
      kind: 'updated',
      job: { state: 'queued', videoId: 'video-job-a', metadata: { title: 'Revised' } },
    });
    expect(await f.repository.retry({ id: 'job-a', ownerId: 'owner-b', now })).toEqual({
      kind: 'missing',
    });
  });

  test('failure classification retries only when requested and within the budget', async () => {
    const f = await fixture();
    await f.enqueue();
    await f.repository.claim({ leaseMs: 90_000, leaseToken: 'lease', now });
    expect(
      await f.repository.fail({
        id: 'job-a',
        leaseToken: 'lease',
        now,
        code: 'INTERRUPTED',
        message: 'Retrying.',
        retryAt: now + 5_000,
      }),
    ).toBe(true);
    expect(await f.repository.findOwned('job-a', 'owner-a')).toMatchObject({
      state: 'queued',
      nextRunAt: now + 5_000,
    });
    await f.repository.claim({ leaseMs: 90_000, leaseToken: 'lease-next', now: now + 5_000 });
    await f.repository.fail({
      id: 'job-a',
      leaseToken: 'lease-next',
      now: now + 5_000,
      code: 'INVALID_VIDEO',
      message: 'Invalid video.',
    });
    expect(await f.repository.findOwned('job-a', 'owner-a')).toMatchObject({
      state: 'failed',
      errorCode: 'INVALID_VIDEO',
    });
  });
});
