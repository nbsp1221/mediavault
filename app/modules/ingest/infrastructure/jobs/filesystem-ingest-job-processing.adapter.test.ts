import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { IngestVideoAnalysisPort } from '~/modules/ingest/application/ports/ingest-video-analysis.port';
import type { ClaimedIngestJob } from '~/modules/ingest/domain/ingest-job';
import { createInitializedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import { decryptThumbnailEnvelope } from '~/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils';
import { FilesystemIngestJobProcessingAdapter } from './filesystem-ingest-job-processing.adapter';
import { SqliteIngestJobRepository } from './sqlite-ingest-job.repository';

const roots: string[] = [];
const now = Date.parse('2026-11-02T00:00:00Z');
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))),
);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ingest-job-artifacts-'));
  roots.push(root);
  const videosDir = path.join(root, 'videos');
  const sourcePath = path.join(root, 'source.mp4');
  await writeFile(sourcePath, 'test-owned-source');
  const jpeg = await readFile(path.join(process.cwd(), 'public/images/video-placeholder.jpg'));
  const job: ClaimedIngestJob = {
    attemptCount: 1,
    attemptsAllowed: 3,
    cancelRequestedAt: null,
    createdAt: now,
    errorCode: null,
    errorMessage: null,
    finishedAt: null,
    id: 'job',
    leaseExpiresAt: now + 90_000,
    leaseToken: 'lease',
    metadata: { genreSlugs: [], tags: [], title: 'Video' },
    nextRunAt: now,
    ownerId: 'owner',
    phase: 'probing',
    requestHash: 'hash',
    sourceCleanupPending: false,
    sourcePath,
    stagingId: 'stage',
    state: 'running',
    updatedAt: now,
    videoId: 'video',
  };
  const analysis = {
    analyze: vi.fn<IngestVideoAnalysisPort['analyze']>(async () => ({
      duration: 1,
      primaryVideo: { codecName: 'h264', streamIndex: 0 },
      primaryAudio: { codecName: 'aac', streamIndex: 1 },
    })),
  };
  const mediaPreparation = {
    prepareMedia: vi.fn(async ({ workspaceRootDir }: { workspaceRootDir?: string }) => {
      if (!workspaceRootDir) {
        throw new Error('Private workspace was not provided.');
      }
      await writeFile(path.join(workspaceRootDir, 'key.bin'), Buffer.alloc(16, 7));
      await writeFile(path.join(workspaceRootDir, 'thumbnail.jpg'), jpeg);
      await writeFile(path.join(workspaceRootDir, 'manifest.mpd'), '<MPD/>');
      await mkdir(path.join(workspaceRootDir, 'video'));
      await writeFile(path.join(workspaceRootDir, 'video/init.mp4'), 'init');
      return { dashEnabled: true, message: 'Prepared' };
    }),
  };
  const adapter = new FilesystemIngestJobProcessingAdapter({
    analysis,
    mediaPreparation,
    storageDir: root,
    videosDir,
  });

  const prepare = () =>
    adapter.prepare({
      job,
      onPhase: vi.fn(async () => undefined),
      signal: new AbortController().signal,
    });

  return { adapter, analysis, job, jpeg, mediaPreparation, prepare, root, videosDir };
}

describe('private ingest attempts and canonical promotion', () => {
  test('prepares privately, encrypts and verifies thumbnail before exposing canonical media', async () => {
    const f = await fixture();
    const prepared = await f.prepare();
    expect(prepared.workspacePath).toContain('.ingest-job-lease');
    await expect(stat(path.join(f.videosDir, 'video'))).rejects.toMatchObject({ code: 'ENOENT' });
    const encrypted = await readFile(path.join(prepared.workspacePath, 'thumbnail.jpg'));
    expect(
      decryptThumbnailEnvelope({
        encryptedBuffer: encrypted,
        key: Buffer.alloc(16, 7),
        videoId: 'video',
      }),
    ).toEqual(f.jpeg);
    await f.adapter.promoteArtifacts(f.job, prepared);
    await expect(stat(path.join(f.videosDir, 'video/manifest.mpd'))).resolves.toBeDefined();
    await f.adapter.cleanupAttempt(f.job);
    await expect(stat(path.join(f.videosDir, 'video/manifest.mpd'))).resolves.toBeDefined();
    await f.adapter.cleanupSource(f.job.sourcePath);
    expect(await f.adapter.isSourceAvailable(f.job.sourcePath)).toBe(false);
  });

  test('quarantines an unpublished crash orphan without deleting canonical selected output during attempt cleanup', async () => {
    const f = await fixture();
    const prepared = await f.prepare();
    await mkdir(path.join(f.videosDir, 'video'));
    await writeFile(path.join(f.videosDir, 'video/old-partial'), 'old');
    await f.adapter.promoteArtifacts(f.job, prepared);
    expect(await readFile(path.join(f.videosDir, '.orphan-video-lease/old-partial'), 'utf8')).toBe(
      'old',
    );
    await f.adapter.cleanupAttempt(f.job);
    await expect(stat(path.join(f.videosDir, '.orphan-video-lease'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await readFile(path.join(f.videosDir, 'video/manifest.mpd'), 'utf8')).toBe('<MPD/>');
  });

  test('rejects missing source, non-video media, invalid thumbnail and false preparation success', async () => {
    const f = await fixture();
    expect(await f.adapter.isSourceAvailable('/outside/source.mp4')).toBe(false);
    await expect(f.adapter.cleanupSource('/outside/source.mp4')).rejects.toMatchObject({
      code: 'INVALID_SOURCE_PATH',
    });
    await rm(f.job.sourcePath);
    await expect(f.prepare()).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
    await writeFile(f.job.sourcePath, 'source');
    f.analysis.analyze.mockResolvedValue({ duration: 1 });
    await expect(f.prepare()).rejects.toMatchObject({ code: 'INVALID_VIDEO' });
    f.analysis.analyze.mockResolvedValue({
      duration: 1,
      primaryVideo: { codecName: 'h264', streamIndex: 0 },
      primaryAudio: { codecName: 'aac', streamIndex: 1 },
    });
    f.mediaPreparation.prepareMedia.mockResolvedValue({ dashEnabled: false, message: 'failed' });
    await expect(f.prepare()).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_FAILED' });
    f.mediaPreparation.prepareMedia.mockImplementation(async ({ workspaceRootDir }) => {
      if (!workspaceRootDir) {
        throw new Error('Private workspace was not provided.');
      }
      await writeFile(path.join(workspaceRootDir, 'key.bin'), Buffer.alloc(16));
      await writeFile(path.join(workspaceRootDir, 'thumbnail.jpg'), 'not a JPEG');
      return { dashEnabled: true, message: 'prepared' };
    });
    await expect(f.prepare()).rejects.toMatchObject({ code: 'INVALID_THUMBNAIL' });
  });

  test('already cancelled work does not probe and unsafe workspace identifiers cannot escape storage', async () => {
    const f = await fixture();
    await expect(
      f.adapter.prepare({
        job: f.job,
        onPhase: vi.fn(),
        signal: AbortSignal.abort(new Error('cancelled')),
      }),
    ).rejects.toThrow('cancelled');
    expect(f.analysis.analyze).not.toHaveBeenCalled();
    await expect(
      f.adapter.cleanupAttempt({ ...f.job, leaseToken: '../outside' }),
    ).rejects.toMatchObject({ code: 'INVALID_WORKSPACE' });
    await expect(
      f.adapter.promoteArtifacts(f.job, {
        duration: 1,
        strategy: 'remux',
        workspacePath: '/outside',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WORKSPACE' });
  });

  test('prepared output links are rejected before publication', async () => {
    const f = await fixture();
    const original = f.mediaPreparation.prepareMedia.getMockImplementation();
    if (!original) {
      throw new Error('Media fixture implementation is missing.');
    }
    f.mediaPreparation.prepareMedia.mockImplementation(async (input) => {
      if (!input.workspaceRootDir) {
        throw new Error('Private workspace was not provided.');
      }
      const result = await original(input);
      await symlink(f.job.sourcePath, path.join(input.workspaceRootDir, 'link'));
      return result;
    });
    await expect(f.prepare()).rejects.toMatchObject({ code: 'INVALID_WORKSPACE' });
  });

  test('actual rename plus failed SQL publication leaves an invisible recoverable orphan, never overwrites a ready video', async () => {
    const f = await fixture();
    const database = await createInitializedPrimarySqliteDatabase({
      dbPath: path.join(f.root, 'db.sqlite'),
      encryptionKey: 'isolated-publication-test-key',
    });
    const timestamp = new Date(now).toISOString();
    await database
      .prepare(
        "INSERT INTO auth_users (id, username, username_key, password_hash, created_at) VALUES ('owner', 'owner', 'owner', 'hash', ?)",
      )
      .run(timestamp);
    await database
      .prepare(
        "INSERT INTO ingest_uploads (staging_id, owner_id, filename, mime_type, size_bytes, storage_relpath, status, created_at, updated_at, expires_at) VALUES ('stage', 'owner', 'source.mp4', 'video/mp4', 10, 'source.mp4', 'uploaded', ?, ?, ?)",
      )
      .run(timestamp, timestamp, new Date(now + 86_400_000).toISOString());
    const promote = vi.fn(f.adapter.promoteArtifacts.bind(f.adapter));
    const repository = new SqliteIngestJobRepository({
      database,
      promoteArtifacts: promote,
      storageDir: f.root,
    });
    await repository.enqueue({
      capacity: 21,
      id: 'job',
      metadata: f.job.metadata,
      now,
      ownerId: 'owner',
      requestHash: 'hash',
      stagingId: 'stage',
      videoId: 'video',
    });
    await repository.claim({ leaseMs: 90_000, leaseToken: 'lease', now });
    const prepared = await f.prepare();
    await database.exec(
      "CREATE TRIGGER injected_failure BEFORE UPDATE ON ingest_uploads WHEN NEW.status = 'committed' BEGIN SELECT RAISE(ABORT, 'publication fault'); END",
    );
    await expect(
      repository.publish({ id: 'job', leaseToken: 'lease', now, prepared }),
    ).rejects.toThrow();
    await expect(stat(path.join(f.videosDir, 'video/manifest.mpd'))).resolves.toBeDefined();
    expect(await database.prepare('SELECT COUNT(*) AS count FROM videos').get()).toMatchObject({
      count: 0,
    });
    expect(await f.adapter.isSourceAvailable(f.job.sourcePath)).toBe(true);
    await database.exec('DROP TRIGGER injected_failure');
    const next = { ...f.job, leaseToken: 'next' };
    await repository.recoverExpired(now + 90_000);
    await repository.claim({ leaseMs: 90_000, leaseToken: 'next', now: now + 95_000 });
    const nextPrepared = await f.adapter.prepare({
      job: next,
      onPhase: vi.fn(),
      signal: new AbortController().signal,
    });
    expect(
      await repository.publish({
        id: 'job',
        leaseToken: 'next',
        now: now + 95_000,
        prepared: nextPrepared,
      }),
    ).toBe(true);
    expect(
      await repository.publish({ id: 'job', leaseToken: 'lease', now: now + 95_001, prepared }),
    ).toBe(false);
    expect(promote).toHaveBeenCalledTimes(2);
    expect(await database.prepare('SELECT COUNT(*) AS count FROM videos').get()).toMatchObject({
      count: 1,
    });
  });
});
