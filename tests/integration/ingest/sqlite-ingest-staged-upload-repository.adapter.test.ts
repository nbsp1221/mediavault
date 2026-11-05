import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { SqliteIngestJobRepository } from '../../../app/modules/ingest/infrastructure/jobs/sqlite-ingest-job.repository';
import { SqliteIngestStagedUploadRepositoryAdapter } from '../../../app/modules/ingest/infrastructure/staging/sqlite-ingest-staged-upload-repository.adapter';
import { createInitializedPrimarySqliteDatabase } from '../../../app/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';

const roots: string[] = [];
const now = Date.parse('2026-04-20T00:00:00Z');
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))),
);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'staged-upload-repository-'));
  roots.push(root);
  const dbPath = path.join(root, 'db.sqlite');
  const database = await createInitializedPrimarySqliteDatabase({ dbPath });
  await database
    .prepare(
      "INSERT INTO auth_users (id, username, username_key, password_hash, created_at) VALUES ('owner', 'owner', 'owner', 'hash', ?)",
    )
    .run(new Date(now).toISOString());
  const repository = new SqliteIngestStagedUploadRepositoryAdapter({ dbPath, storageDir: root });
  const jobRepository = new SqliteIngestJobRepository({
    database,
    promoteArtifacts: async () => undefined,
    storageDir: root,
  });

  const stage = (id = 'stage', expiresAt = now + 86_400_000) =>
    repository.create({
      createdAt: new Date(now),
      expiresAt: new Date(expiresAt),
      filename: 'video.mp4',
      mimeType: 'video/mp4',
      ownerId: 'owner',
      size: 10,
      stagingId: id,
      status: 'uploaded',
      storagePath: path.join(root, 'staging', id, 'video.mp4'),
    });

  const enqueue = (stagingId = 'stage') =>
    jobRepository.enqueue({
      capacity: 21,
      id: `job-${stagingId}`,
      metadata: { genreSlugs: [], tags: [], title: 'Video' },
      now,
      ownerId: 'owner',
      requestHash: 'hash',
      stagingId,
      videoId: `video-${stagingId}`,
    });

  return { database, enqueue, jobRepository, repository, root, stage };
}

describe('creator-owned staged sources', () => {
  test('creates, reads and explicitly removes a staged source', async () => {
    const f = await fixture();
    const created = await f.stage();
    expect(created).toMatchObject({ ownerId: 'owner', filename: 'video.mp4', status: 'uploaded' });
    expect(await f.repository.findByStagingId('stage')).toEqual(created);
    expect(await f.repository.beginRemoval('stage', 'other')).toBe('missing');
    expect(await f.repository.beginRemoval('missing', 'owner')).toBe('missing');
    expect(await f.repository.beginRemoval('stage', 'owner')).toBe('acquired');
    expect(await f.repository.findByStagingId('stage')).toMatchObject({ status: 'removing' });
    expect(await f.repository.beginRemoval('stage', 'owner')).toBe('acquired');
    await f.repository.delete('stage');
    expect(await f.repository.findByStagingId('stage')).toBeNull();
  });

  test('source paths are contained in the explicit storage workspace', async () => {
    const f = await fixture();
    await expect(
      f.repository.create({
        createdAt: new Date(now),
        expiresAt: new Date(now + 1),
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        ownerId: 'owner',
        size: 1,
        stagingId: 'outside',
        status: 'uploaded',
        storagePath: '/outside/video.mp4',
      }),
    ).rejects.toThrow('inside storage root');
  });

  test('only the job state machine reserves identity and pins active processing input', async () => {
    const f = await fixture();
    await f.stage();
    expect(await f.enqueue()).toMatchObject({ kind: 'accepted' });
    expect(await f.repository.beginRemoval('stage', 'owner')).toBe('busy');
    expect(await f.repository.findByStagingId('stage')).toMatchObject({
      committedVideoId: undefined,
      status: 'committing',
    });
    await f.jobRepository.requestCancellation({ id: 'job-stage', now, ownerId: 'owner' });
    expect(await f.repository.beginRemoval('stage', 'owner')).toBe('acquired');
    expect(await f.jobRepository.retry({ id: 'job-stage', now, ownerId: 'owner' })).toEqual({
      kind: 'conflict',
    });
  });

  test('enqueue and removal claims cannot both win the same source', async () => {
    const f = await fixture();
    await f.stage();
    const [accepted, removal] = await Promise.all([
      f.enqueue(),
      f.repository.beginRemoval('stage', 'owner'),
    ]);
    expect([
      ['accepted', 'busy'],
      ['conflict', 'acquired'],
    ]).toContainEqual([accepted.kind, removal]);
    await f.stage('remove-first');
    const [claimed, rejected] = await Promise.all([
      f.repository.beginRemoval('remove-first', 'owner'),
      f.enqueue('remove-first'),
    ]);
    expect([
      ['acquired', 'conflict'],
      ['busy', 'accepted'],
    ]).toContainEqual([claimed, rejected.kind]);
  });

  test('ordinary TTL excludes committed sources and all accepted job inputs, including failed jobs', async () => {
    const f = await fixture();
    await f.stage('expired', now - 1);
    await f.stage('active');
    await f.stage('job-source');
    await f.enqueue('job-source');
    await f.jobRepository.claim({ leaseMs: 90_000, leaseToken: 'lease', now });
    await f.jobRepository.fail({
      code: 'INVALID_VIDEO',
      id: 'job-job-source',
      leaseToken: 'lease',
      message: 'Invalid video.',
      now,
    });
    await f.database
      .prepare(
        "INSERT INTO videos (id, title, duration_seconds, owner_id, visibility, created_at, updated_at, sort_index) VALUES ('committed-video', 'Video', 1, 'owner', 'private', ?, ?, 1)",
      )
      .run(new Date(now).toISOString(), new Date(now).toISOString());
    await f.repository.create({
      committedVideoId: 'committed-video',
      createdAt: new Date(now),
      expiresAt: new Date(now - 1),
      filename: 'committed.mp4',
      mimeType: 'video/mp4',
      ownerId: 'owner',
      size: 1,
      stagingId: 'committed',
      status: 'committed',
      storagePath: path.join(f.root, 'staging/committed/video.mp4'),
    });
    expect(
      (await f.repository.listExpired(new Date(now + 86_400_001)))
        .map((upload) => upload.stagingId)
        .sort(),
    ).toEqual(['active', 'expired']);
    expect(await f.repository.findByStagingId('committed')).toMatchObject({
      committedVideoId: 'committed-video',
    });
    expect(await f.repository.beginRemoval('committed', 'owner')).toBe('busy');
  });
});
