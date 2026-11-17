import { describe, expect, test, vi } from 'vitest';
import type { IngestJobRepositoryPort } from '~/modules/ingest/application/ports/ingest-job-repository.port';
import type { IngestJob } from '~/modules/ingest/domain/ingest-job';
import { toIngestJobView } from '~/modules/ingest/domain/ingest-job-view';
import { ManageIngestJobsUseCase, parseIngestJobMetadata } from './manage-ingest-jobs.usecase';

const job: IngestJob = {
  attemptCount: 1,
  attemptsAllowed: 3,
  cancelRequestedAt: null,
  createdAt: 1,
  errorCode: 'BAD_MEDIA',
  errorMessage: 'Invalid video.',
  finishedAt: 2,
  id: 'job',
  leaseExpiresAt: null,
  leaseToken: null,
  metadata: { title: 'Video', tags: [], genreSlugs: [] },
  nextRunAt: 1,
  ownerId: 'owner',
  phase: 'probing',
  requestHash: 'secret-hash',
  sourceCleanupPending: false,
  sourcePath: '/private/storage/source',
  stagingId: 'stage',
  state: 'failed',
  updatedAt: 2,
  videoId: 'video',
};

function fixture() {
  const repository = {
    acknowledgeSourceCleanup: vi.fn(),
    cancelAttempt: vi.fn(),
    claim: vi.fn(),
    enqueue: vi.fn(async () => ({ kind: 'accepted' as const, job })),
    fail: vi.fn(),
    findOwned: vi.fn(async () => job as IngestJob | null),
    hasActiveJobs: vi.fn(),
    hasOwnedStage: vi.fn(async () => true),
    heartbeat: vi.fn(),
    listOwned: vi.fn(async () => [job]),
    nextSourceCleanup: vi.fn(),
    publish: vi.fn(),
    recoverExpired: vi.fn(),
    requestCancellation: vi.fn(async () => ({ kind: 'updated' as const, job })),
    retry: vi.fn<IngestJobRepositoryPort['retry']>(async () => ({ kind: 'updated', job })),
  } satisfies IngestJobRepositoryPort;
  const wake = vi.fn();
  const isSourceAvailable = vi.fn(async () => true);
  const usecase = new ManageIngestJobsUseCase({
    createId: () => 'generated',
    isSourceAvailable,
    now: () => 10,
    repository,
    wake,
  });
  return { isSourceAvailable, repository, usecase, wake };
}

describe('ingest job control', () => {
  test('validates and canonicalizes metadata while ignoring spoofed ownership and stale options', () => {
    const result = parseIngestJobMetadata({
      contentTypeSlug: ' Movie ',
      description: ' Description ',
      genreSlugs: ['Drama', 'drama'],
      ownerId: 'attacker',
      tags: ['Some Tag', 'some_tag'],
      title: ' Video ',
      encodingOptions: { encoder: 'unsupported' },
    });
    expect(result.metadata).toEqual({
      contentTypeSlug: 'movie',
      description: 'Description',
      genreSlugs: ['drama'],
      tags: ['some tag', 'some_tag'],
      title: 'Video',
    });
    expect(
      parseIngestJobMetadata({ genreSlugs: ['action', 'drama'], tags: ['a', 'b'], title: 'Video' })
        .requestHash,
    ).toEqual(
      parseIngestJobMetadata({ genreSlugs: ['drama', 'action'], tags: ['b', 'a'], title: 'Video' })
        .requestHash,
    );
    expect(() => parseIngestJobMetadata({ title: ' ' })).toThrow();
    expect(() => parseIngestJobMetadata({ title: 'a'.repeat(201) })).toThrow();
    expect(() =>
      parseIngestJobMetadata({ title: 'Video', description: 'a'.repeat(1_001) }),
    ).toThrow();
    expect(parseIngestJobMetadata({ title: 'Video' }).metadata).toMatchObject({
      tags: [],
      genreSlugs: [],
    });
  });

  test('accepts with trusted actor and wakes only after durable acceptance', async () => {
    const f = fixture();
    await f.usecase.accept({
      metadata: { title: 'Video', ownerId: 'attacker' },
      ownerId: 'owner',
      stagingId: 'stage',
    });
    expect(f.repository.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'generated',
        ownerId: 'owner',
        stagingId: 'stage',
        videoId: 'generated',
        now: 10,
        capacity: 21,
      }),
    );
    expect(f.wake).toHaveBeenCalledOnce();
  });

  test('safe views never expose filesystem, hash, lease, or premature video URL', async () => {
    const f = fixture();
    const view = await f.usecase.get('job', 'owner');
    expect(view).toMatchObject({ canRetry: true, error: { code: 'BAD_MEDIA' }, videoId: null });
    expect(view).not.toHaveProperty('sourcePath');
    expect(view).not.toHaveProperty('requestHash');
    expect(view).not.toHaveProperty('leaseToken');
    expect(toIngestJobView({ ...job, state: 'succeeded', errorCode: null }).videoId).toBe('video');
    f.repository.findOwned.mockResolvedValue(null);
    expect(await f.usecase.get('missing', 'owner')).toBeNull();
  });

  test('lists only owner jobs and validates bounded pagination', async () => {
    const f = fixture();
    expect(await f.usecase.list('owner')).toHaveLength(1);
    expect(f.repository.listOwned).toHaveBeenCalledWith('owner', { limit: 50, offset: 0 });
    await expect(f.usecase.list('owner', { limit: 101, offset: 0 })).rejects.toThrow(
      'Invalid job pagination.',
    );
    await expect(f.usecase.list('owner', { limit: 1, offset: -1 })).rejects.toThrow(
      'Invalid job pagination.',
    );
  });

  test('retry revalidates source and metadata without allocating a new video identity', async () => {
    const f = fixture();
    await f.usecase.retry('job', 'owner', { title: 'Corrected' });
    expect(f.repository.retry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'job',
        ownerId: 'owner',
        metadata: f.repository.retry.mock.calls[0]?.[0].metadata,
      }),
    );
    expect(f.repository.retry.mock.calls[0]?.[0].metadata?.title).toBe('Corrected');
    f.isSourceAvailable.mockResolvedValue(false);
    expect(await f.usecase.retry('job', 'owner')).toEqual({ kind: 'source_missing' });
    f.repository.findOwned.mockResolvedValue({ ...job, state: 'running' });
    expect(await f.usecase.retry('job', 'owner')).toEqual({ kind: 'conflict' });
    f.repository.findOwned.mockResolvedValue(null);
    expect(await f.usecase.retry('job', 'owner')).toEqual({ kind: 'missing' });
  });

  test('cancel records an owner request rather than claiming the process is already stopped', async () => {
    const f = fixture();
    await f.usecase.cancel('job', 'owner');
    expect(f.repository.requestCancellation).toHaveBeenCalledWith({
      id: 'job',
      ownerId: 'owner',
      now: 10,
    });
    expect(f.wake).toHaveBeenCalledOnce();
  });
});
