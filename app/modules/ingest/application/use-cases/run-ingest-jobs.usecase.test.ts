import { afterEach, describe, expect, test, vi } from 'vitest';
import type { IngestJobProcessingPort } from '~/modules/ingest/application/ports/ingest-job-processing.port';
import type { IngestJobRepositoryPort } from '~/modules/ingest/application/ports/ingest-job-repository.port';
import type { ClaimedIngestJob, PreparedIngestJob } from '~/modules/ingest/domain/ingest-job';
import { IngestJobError } from '~/modules/ingest/domain/ingest-job';
import { RunIngestJobsUseCase } from './run-ingest-jobs.usecase';

const now = 1_000_000;
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
  sourcePath: '/isolated/source.mp4',
  stagingId: 'stage',
  state: 'running',
  updatedAt: now,
  videoId: 'video',
};
const prepared: PreparedIngestJob = {
  duration: 10,
  strategy: 'preserve',
  workspacePath: '/isolated/attempt',
};

function fixture() {
  const repository = {
    acknowledgeSourceCleanup: vi.fn(async () => undefined),
    cancelAttempt: vi.fn(async () => true),
    claim: vi.fn(async () => null as ClaimedIngestJob | null).mockResolvedValueOnce(job),
    enqueue: vi.fn(),
    fail: vi.fn<IngestJobRepositoryPort['fail']>(async () => true),
    findOwned: vi.fn(),
    hasActiveJobs: vi.fn(),
    hasOwnedStage: vi.fn(),
    heartbeat: vi.fn<IngestJobRepositoryPort['heartbeat']>(async () => 'renewed'),
    listOwned: vi.fn(),
    nextSourceCleanup: vi.fn(async () => null as typeof job | null),
    publish: vi.fn(async () => true),
    recoverExpired: vi.fn(async () => undefined),
    requestCancellation: vi.fn(),
    retry: vi.fn(),
  } satisfies IngestJobRepositoryPort;
  const processing = {
    cleanupAttempt: vi.fn(async () => undefined),
    cleanupSource: vi.fn(async () => undefined),
    prepare: vi.fn(async ({ onPhase }: Parameters<IngestJobProcessingPort['prepare']>[0]) => {
      await onPhase('preparing');
      return prepared;
    }),
  } satisfies IngestJobProcessingPort;
  const onError = vi.fn();
  const runner = new RunIngestJobsUseCase({
    createLeaseToken: () => 'lease',
    heartbeatMs: 10,
    now: () => now,
    onError,
    pollMs: 10,
    processing,
    random: () => 0,
    repository,
  });
  return { onError, processing, repository, runner };
}

afterEach(() => vi.useRealTimers());

describe('single ingest job runner', () => {
  test('processes and publishes one complete workflow with owned phases', async () => {
    const f = fixture();
    expect(await f.runner.runNext()).toBe(true);
    expect(f.repository.recoverExpired).toHaveBeenCalledWith(now);
    expect(f.repository.heartbeat).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'preparing' }),
    );
    expect(f.repository.publish).toHaveBeenCalledWith({
      id: job.id,
      leaseToken: 'lease',
      now,
      prepared,
    });
    expect(f.processing.cleanupAttempt).toHaveBeenCalledWith(job);
    expect(f.repository.fail).not.toHaveBeenCalled();
    expect(await f.runner.runNext()).toBe(false);
  });

  test('only explicit transient failures schedule bounded automatic retry', async () => {
    const f = fixture();
    f.processing.prepare.mockRejectedValue(
      new IngestJobError('PROCESSING_INTERRUPTED', 'Interrupted.', true),
    );
    await f.runner.runNext();
    expect(f.repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PROCESSING_INTERRUPTED', retryAt: now + 5_000 }),
    );
    expect(f.repository.publish).not.toHaveBeenCalled();
    const deterministic = fixture();
    deterministic.processing.prepare.mockRejectedValue(
      new Error('raw tool output with private arguments'),
    );
    await deterministic.runner.runNext();
    expect(deterministic.repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PROCESSING_FAILED', retryAt: undefined }),
    );
    expect(deterministic.repository.fail.mock.calls[0][0].message).not.toContain(
      'private arguments',
    );
  });

  test('second attempt uses longer backoff and concurrent ticks never run a second job', async () => {
    const f = fixture();
    f.repository.claim.mockReset().mockResolvedValue({ ...job, attemptCount: 2 });
    let reject!: (error: Error) => void;
    f.processing.prepare.mockImplementation(
      () =>
        new Promise((_, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    const running = f.runner.runNext();
    await vi.waitFor(() => expect(f.processing.prepare).toHaveBeenCalledOnce());
    expect(await f.runner.runNext()).toBe(false);
    reject(new IngestJobError('TEMPORARY_IO', 'Temporary error.', true));
    await running;
    expect(f.repository.claim).toHaveBeenCalledOnce();
    expect(f.repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ retryAt: now + 30_000 }),
    );
  });

  test.each(['cancelled', 'lost'] as const)(
    'heartbeat %s aborts real work before status or cleanup',
    async (result) => {
      vi.useFakeTimers();
      const f = fixture();
      let finishChild!: () => void;
      f.processing.prepare.mockImplementation(
        ({ signal }) =>
          new Promise((_, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                finishChild = () =>
                  reject(
                    signal.reason instanceof Error
                      ? signal.reason
                      : new Error('Processing aborted'),
                  );
              },
              { once: true },
            );
          }),
      );
      f.repository.heartbeat.mockResolvedValue(result);
      const running = f.runner.runNext();
      await vi.waitFor(() => expect(f.processing.prepare).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(10);
      expect(f.processing.cleanupAttempt).not.toHaveBeenCalled();
      expect(f.repository.cancelAttempt).not.toHaveBeenCalled();
      finishChild();
      await running;
      expect(f.repository.publish).not.toHaveBeenCalled();
      expect(f.repository.cancelAttempt).toHaveBeenCalledTimes(result === 'cancelled' ? 1 : 0);
      expect(
        f.repository.fail.mock.calls.map(([failure]) => ({
          code: failure.code,
          retryAt: failure.retryAt,
        })),
      ).toEqual(result === 'lost' ? [{ code: 'LEASE_LOST', retryAt: now + 5_000 }] : []);
    },
  );

  test('heartbeat infrastructure error aborts and is classified as retryable ownership failure', async () => {
    const f = fixture();
    f.repository.heartbeat.mockRejectedValue(new Error('database unavailable'));
    await f.runner.runNext();
    expect(f.repository.publish).not.toHaveBeenCalled();
    expect(f.repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'LEASE_RENEWAL_FAILED', retryAt: now + 5_000 }),
    );
  });

  test('shutdown waits for actual processing termination before requeue and cleanup', async () => {
    const f = fixture();
    const controller = new AbortController();
    let close!: () => void;
    f.processing.prepare.mockImplementation(
      ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            close = () =>
              reject(
                signal.reason instanceof Error ? signal.reason : new Error('Processing aborted'),
              );
          });
        }),
    );
    const running = f.runner.runNext(controller.signal);
    await vi.waitFor(() => expect(f.processing.prepare).toHaveBeenCalledOnce());
    controller.abort();
    expect(f.repository.fail).not.toHaveBeenCalled();
    expect(f.processing.cleanupAttempt).not.toHaveBeenCalled();
    close();
    await running;
    expect(f.repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PROCESSING_INTERRUPTED', retryAt: now + 5_000 }),
    );
    expect(f.processing.cleanupAttempt).toHaveBeenCalledOnce();
  });

  test('fenced publication denial never reports success', async () => {
    const f = fixture();
    f.repository.publish.mockResolvedValue(false);
    await f.runner.runNext();
    expect(f.repository.fail).toHaveBeenCalledWith(expect.objectContaining({ code: 'LEASE_LOST' }));
  });

  test('completed source cleanup failure remains pending and never rolls back success', async () => {
    const f = fixture();
    f.repository.publish.mockImplementation(async () => {
      f.repository.nextSourceCleanup.mockResolvedValue({ ...job, sourceCleanupPending: true });
      return true;
    });
    f.processing.cleanupSource.mockRejectedValue(new Error('unlink failed'));
    await f.runner.runNext();
    expect(f.repository.fail).not.toHaveBeenCalled();
    expect(f.repository.acknowledgeSourceCleanup).not.toHaveBeenCalled();
    await f.runner.runNext();
    expect(f.processing.cleanupSource).toHaveBeenCalledOnce();
    expect(f.onError).toHaveBeenCalledOnce();
  });

  test('restart handles persisted pending cleanup before new work', async () => {
    const f = fixture();
    f.repository.nextSourceCleanup.mockResolvedValueOnce({ ...job, sourceCleanupPending: true });
    await f.runner.runNext();
    expect(f.processing.cleanupSource).toHaveBeenCalledWith(job.sourcePath);
    expect(f.repository.acknowledgeSourceCleanup).toHaveBeenCalledWith(job.id);
  });

  test('start is singleton, polling wakeup and stop clear idle timers', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.repository.claim.mockReset().mockResolvedValue(null);
    f.runner.start();
    f.runner.start();
    await vi.waitFor(() => expect(f.repository.claim).toHaveBeenCalledOnce());
    f.runner.wake();
    await vi.waitFor(() => expect(f.repository.claim).toHaveBeenCalledTimes(2));
    await f.runner.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('polling errors are observed and stopped rather than busy-spinning', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.repository.claim.mockRejectedValue(new Error('database unavailable'));
    f.runner.start();
    await vi.waitFor(() => expect(f.onError).toHaveBeenCalledOnce());
    await f.runner.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(await f.runner.runNext(AbortSignal.abort())).toBe(false);
  });
});
