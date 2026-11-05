import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { IngestJobProcessingPort } from '~/modules/ingest/application/ports/ingest-job-processing.port';
import type { LibraryVideoArtifactRemovalPort } from '~/modules/library/application/ports/library-video-artifact-removal.port';
import { RemoveStagedUploadUseCase } from '~/modules/ingest/application/use-cases/remove-staged-upload.usecase';
import { RunIngestJobsUseCase } from '~/modules/ingest/application/use-cases/run-ingest-jobs.usecase';
import { FilesystemIngestJobProcessingAdapter } from '~/modules/ingest/infrastructure/jobs/filesystem-ingest-job-processing.adapter';
import { SqliteIngestJobRepository } from '~/modules/ingest/infrastructure/jobs/sqlite-ingest-job.repository';
import { FilesystemIngestStagedUploadStorageAdapter } from '~/modules/ingest/infrastructure/staging/filesystem-ingest-staged-upload-storage.adapter';
import { SqliteActiveUploadCounterAdapter } from '~/modules/ingest/infrastructure/staging/sqlite-active-upload-counter.adapter';
import { SqliteIngestStagedUploadRepositoryAdapter } from '~/modules/ingest/infrastructure/staging/sqlite-ingest-staged-upload-repository.adapter';
import { DeleteLibraryVideoUseCase } from '~/modules/library/application/use-cases/delete-library-video.usecase';
import { SqliteLibraryVideoMetadataRepository } from '~/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository';
import { SqliteLibraryVideoMutationAdapter } from '~/modules/library/infrastructure/sqlite/sqlite-library-video-mutation.adapter';
import { SqliteOwnedVideoCounterAdapter } from '~/modules/library/infrastructure/sqlite/sqlite-owned-video-counter.adapter';
import { createInitializedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import { DeleteUserUseCase } from '~/modules/user/application/use-cases/delete-user.usecase';
import { SqliteUserRepository } from '~/modules/user/infrastructure/sqlite/sqlite-user.repository';

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))),
);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'deleted-video-source-intent-'));
  roots.push(root);
  const dbPath = path.join(root, 'db.sqlite');
  const database = await createInitializedPrimarySqliteDatabase({ dbPath });
  let now = Date.parse('2026-11-02T00:00:00.000Z');
  await database
    .prepare(
      "INSERT INTO auth_users (id, username, username_key, password_hash, created_at) VALUES ('owner', 'owner', 'owner', 'test-hash', ?)",
    )
    .run(new Date(now).toISOString());
  const sourcePath = path.join(root, 'staging/stage/video.mp4');
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, 'test-owned source bytes');
  const stages = new SqliteIngestStagedUploadRepositoryAdapter({ dbPath, storageDir: root });
  await stages.create({
    createdAt: new Date(now),
    expiresAt: new Date(now + 86_400_000),
    filename: 'video.mp4',
    mimeType: 'video/mp4',
    ownerId: 'owner',
    size: 23,
    stagingId: 'stage',
    status: 'uploaded',
    storagePath: sourcePath,
  });
  // Publication SQL and source I/O are real; media promotion is irrelevant to this cleanup race.
  const jobs = new SqliteIngestJobRepository({
    database,
    storageDir: root,
    promoteArtifacts: async () => undefined,
  });
  await jobs.enqueue({
    capacity: 21,
    id: 'job',
    metadata: { title: 'Video', tags: [], genreSlugs: [] },
    now,
    ownerId: 'owner',
    requestHash: 'hash',
    stagingId: 'stage',
    videoId: 'video',
  });
  const claimed = await jobs.claim({ leaseMs: 90_000, leaseToken: 'lease', now });
  if (!claimed) {
    throw new Error('Fixture job was not claimed.');
  }
  expect(
    await jobs.publish({
      id: claimed.id,
      leaseToken: claimed.leaseToken,
      now,
      prepared: { duration: 1, strategy: 'remux_then_package', workspacePath: root },
    }),
  ).toBe(true);
  const metadata = new SqliteLibraryVideoMetadataRepository({ dbPath });
  const videoArtifacts = {
    cleanupVideoArtifacts: vi.fn<LibraryVideoArtifactRemovalPort['cleanupVideoArtifacts']>(
      async () => ({}),
    ),
  };
  const deletion = new DeleteLibraryVideoUseCase({
    videoArtifacts,
    videoMutation: new SqliteLibraryVideoMutationAdapter({ repository: metadata }),
  });
  const activeUploads = new SqliteActiveUploadCounterAdapter({ dbPath });
  const accountDeletion = new DeleteUserUseCase({
    activeUploadCounter: activeUploads,
    ownedVideoCounter: new SqliteOwnedVideoCounterAdapter({ dbPath }),
    userRepository: new SqliteUserRepository({ dbPath }),
  });
  const filesystem = new FilesystemIngestJobProcessingAdapter({
    analysis: { analyze: vi.fn() },
    mediaPreparation: { prepareMedia: vi.fn() },
    storageDir: root,
    videosDir: path.join(root, 'videos'),
  });
  const processing = {
    cleanupAttempt: vi.fn(),
    cleanupSource: vi.fn<IngestJobProcessingPort['cleanupSource']>((source) =>
      filesystem.cleanupSource(source),
    ),
    prepare: vi.fn(),
  } satisfies IngestJobProcessingPort;
  const runner = new RunIngestJobsUseCase({
    now: () => now,
    onError: vi.fn(),
    processing,
    repository: jobs,
  });
  const removeSource = new RemoveStagedUploadUseCase({
    stagedUploadRepository: stages,
    stagedUploadStorage: new FilesystemIngestStagedUploadStorageAdapter({
      storagePaths: {
        stagingDir: path.join(root, 'staging'),
        stagingTempDir: path.join(root, 'staging/temp'),
        storageDir: root,
        videosDir: path.join(root, 'videos'),
      },
    }),
  });
  return {
    accountDeletion,
    activeUploads,
    database,
    deleteOwnVideo: () =>
      deletion.execute({ videoId: 'video', viewer: { type: 'authenticated', userId: 'owner' } }),
    deletion,
    filesystem,
    jobs,
    metadata,
    processing,
    removeSource,
    runner,
    sourcePath,
    stages,
    videoArtifacts,
    advanceCleanupRetry: () => {
      now += 30_000;
    },
  };
}

describe('video deletion preserves pending source cleanup', () => {
  test('owner deletion retains the input intent, failed unlink stays retryable and successful cleanup releases account deletion', async () => {
    const f = await fixture();
    await expect(
      f.deletion.execute({
        videoId: 'video',
        viewer: { type: 'authenticated', userId: 'another-account' },
      }),
    ).resolves.toMatchObject({ ok: false, reason: 'VIDEO_NOT_FOUND' });
    expect(f.videoArtifacts.cleanupVideoArtifacts).not.toHaveBeenCalled();
    f.videoArtifacts.cleanupVideoArtifacts.mockResolvedValue({ warning: 'Output cleanup warning' });
    await expect(f.deleteOwnVideo()).resolves.toMatchObject({
      ok: true,
      data: { warning: 'Output cleanup warning' },
    });
    expect(await f.metadata.findById('video')).toBeNull();
    expect(await f.stages.findByStagingId('stage')).toMatchObject({
      status: 'removing',
      committedVideoId: undefined,
    });
    expect(await f.jobs.nextSourceCleanup()).toMatchObject({
      id: 'job',
      sourceCleanupPending: true,
      sourcePath: f.sourcePath,
    });
    expect(await f.activeUploads.countActiveUploads('owner')).toBe(1);
    await expect(f.accountDeletion.execute({ username: 'owner' })).resolves.toMatchObject({
      ok: false,
      reason: 'USER_HAS_ACTIVE_UPLOADS',
    });
    f.processing.cleanupSource.mockRejectedValueOnce(
      new Error('Temporary source cleanup unavailable'),
    );
    await f.runner.runNext();
    expect(await readFile(f.sourcePath, 'utf8')).toBe('test-owned source bytes');
    expect(await f.jobs.nextSourceCleanup()).not.toBeNull();
    f.advanceCleanupRetry();
    await f.runner.runNext();
    await expect(readFile(f.sourcePath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await f.jobs.findOwned('job', 'owner')).toBeNull();
    expect(await f.stages.findByStagingId('stage')).toBeNull();
    expect(await f.activeUploads.countActiveUploads('owner')).toBe(0);
    await expect(f.accountDeletion.execute({ username: 'owner' })).resolves.toMatchObject({
      ok: true,
    });
    expect(f.processing.prepare).not.toHaveBeenCalled();
  });

  test('cleanup completed before video deletion preserves existing ready video and history until normal deletion', async () => {
    const f = await fixture();
    await f.filesystem.cleanupSource(f.sourcePath);
    await f.jobs.acknowledgeSourceCleanup('job');
    expect(await f.metadata.findById('video')).not.toBeNull();
    expect(await f.jobs.findOwned('job', 'owner')).toMatchObject({
      state: 'succeeded',
      sourceCleanupPending: false,
    });
    expect(await f.stages.findByStagingId('stage')).toMatchObject({
      status: 'committed',
      committedVideoId: 'video',
    });
    await f.deleteOwnVideo();
    expect(await f.jobs.findOwned('job', 'owner')).toBeNull();
    expect(await f.stages.findByStagingId('stage')).toBeNull();
    await expect(f.accountDeletion.execute({ username: 'owner' })).resolves.toMatchObject({
      ok: true,
    });
  });

  test('explicit owner removal can release a deleted video source while the runner is unavailable', async () => {
    const f = await fixture();
    await f.deleteOwnVideo();
    await expect(
      f.removeSource.execute({ ownerId: 'another-account', stagingId: 'stage' }),
    ).resolves.toMatchObject({ ok: false, reason: 'REMOVE_STAGED_UPLOAD_NOT_FOUND' });
    await expect(f.removeSource.execute({ ownerId: 'owner', stagingId: 'stage' })).resolves.toEqual(
      { ok: true },
    );
    await expect(readFile(f.sourcePath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await f.jobs.nextSourceCleanup()).toBeNull();
    await f.jobs.acknowledgeSourceCleanup('job');
    await expect(f.accountDeletion.execute({ username: 'owner' })).resolves.toMatchObject({
      ok: true,
    });
  });

  test('concurrent unlink acknowledgement and owner video deletion cannot lose a live source intent', async () => {
    const f = await fixture();
    await Promise.all([
      f.filesystem.cleanupSource(f.sourcePath).then(() => f.jobs.acknowledgeSourceCleanup('job')),
      f.deleteOwnVideo(),
    ]);
    expect(await f.jobs.nextSourceCleanup()).toBeNull();
    expect(await f.stages.findByStagingId('stage')).toBeNull();
    await expect(readFile(f.sourcePath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await f.activeUploads.countActiveUploads('owner')).toBe(0);
  });

  test('failed video SQL deletion rolls back the detached reference and does not run artifact cleanup', async () => {
    const f = await fixture();
    await f.database.exec(
      "CREATE TRIGGER fail_video_delete BEFORE DELETE ON videos BEGIN SELECT RAISE(ABORT, 'test-owned video deletion failure'); END;",
    );
    await expect(f.deleteOwnVideo()).rejects.toThrow('test-owned video deletion failure');
    expect(await f.stages.findByStagingId('stage')).toMatchObject({
      status: 'committed',
      committedVideoId: 'video',
    });
    expect(await f.jobs.nextSourceCleanup()).not.toBeNull();
    expect(await f.metadata.findById('video')).not.toBeNull();
    expect(f.videoArtifacts.cleanupVideoArtifacts).not.toHaveBeenCalled();
  });

  test('failed acknowledgement keeps intent even after unlink and retry safely handles the missing source', async () => {
    const f = await fixture();
    await f.deleteOwnVideo();
    await f.filesystem.cleanupSource(f.sourcePath);
    await f.database.exec(
      "CREATE TRIGGER fail_source_retirement BEFORE DELETE ON ingest_uploads BEGIN SELECT RAISE(ABORT, 'test-owned source retirement failure'); END;",
    );
    await expect(f.jobs.acknowledgeSourceCleanup('job')).rejects.toThrow(
      'test-owned source retirement failure',
    );
    expect(await f.jobs.nextSourceCleanup()).not.toBeNull();
    expect(await f.activeUploads.countActiveUploads('owner')).toBe(1);
    await f.database.exec('DROP TRIGGER fail_source_retirement;');
    await f.runner.runNext();
    expect(await f.jobs.nextSourceCleanup()).toBeNull();
    expect(await f.activeUploads.countActiveUploads('owner')).toBe(0);
    await expect(f.accountDeletion.execute({ username: 'owner' })).resolves.toMatchObject({
      ok: true,
    });
  });
});
