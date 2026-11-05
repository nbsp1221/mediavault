import { randomUUID } from 'node:crypto';
import type { IngestJobProcessingPort } from '~/modules/ingest/application/ports/ingest-job-processing.port';
import type { IngestJobRepositoryPort } from '~/modules/ingest/application/ports/ingest-job-repository.port';
import type { ClaimedIngestJob, IngestJobPhase } from '~/modules/ingest/domain/ingest-job';
import { IngestJobError, getIngestJobFailure } from '~/modules/ingest/domain/ingest-job';

interface Dependencies {
  createLeaseToken?: () => string;
  heartbeatMs?: number;
  leaseMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
  pollMs?: number;
  processing: IngestJobProcessingPort;
  random?: () => number;
  repository: IngestJobRepositoryPort;
}

export class RunIngestJobsUseCase {
  private active: Promise<boolean> | null = null;
  private controller: AbortController | null = null;
  private loop: Promise<void> | null = null;
  private nextCleanupAt = 0;
  private wakeWaiter: (() => void) | null = null;
  private readonly now: () => number;
  private readonly leaseMs: number;

  constructor(private readonly deps: Dependencies) {
    this.now = deps.now ?? Date.now;
    this.leaseMs = deps.leaseMs ?? 90_000;
  }

  start(): void {
    if (this.loop) {
      return;
    }
    const controller = new AbortController();
    this.controller = controller;
    this.loop = this.runLoop(controller.signal).finally(() => {
      this.loop = null;
      this.controller = null;
    });
  }

  wake(): void {
    this.wakeWaiter?.();
  }

  async stop(): Promise<void> {
    this.controller?.abort();
    this.wake();
    await this.loop;
    await this.active;
  }

  async runNext(signal?: AbortSignal): Promise<boolean> {
    if (this.active || signal?.aborted) {
      return false;
    }
    this.active = this.executeNext(signal);
    try {
      return await this.active;
    } finally {
      this.active = null;
    }
  }

  private async runLoop(signal: AbortSignal): Promise<void> {
    const stopped = () => signal.aborted;

    while (!stopped()) {
      let worked = false;
      try {
        worked = await this.runNext(signal);
      } catch (error) {
        this.deps.onError?.(error);
      }
      if (!worked && !stopped()) {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            this.wakeWaiter = null;
            resolve();
          };

          const timer = setTimeout(done, this.deps.pollMs ?? 2_000);

          this.wakeWaiter = done;
          if (signal.aborted) {
            done();
          }
        });
      }
    }
  }

  private async executeNext(signal?: AbortSignal): Promise<boolean> {
    await this.cleanupSource();
    await this.deps.repository.recoverExpired(this.now());
    if (signal?.aborted) {
      return false;
    }
    const job = await this.deps.repository.claim({
      leaseMs: this.leaseMs,
      leaseToken: (this.deps.createLeaseToken ?? randomUUID)(),
      now: this.now(),
    });
    if (!job) {
      return false;
    }
    await this.executeAttempt(job, signal);
    return true;
  }

  private async executeAttempt(job: ClaimedIngestJob, shutdownSignal?: AbortSignal): Promise<void> {
    const controller = new AbortController();

    const interrupted = () =>
      controller.abort(
        new IngestJobError(
          'PROCESSING_INTERRUPTED',
          'Processing was interrupted by server shutdown.',
          true,
        ),
      );

    shutdownSignal?.addEventListener('abort', interrupted, { once: true });
    if (shutdownSignal?.aborted) {
      interrupted();
    }
    let heartbeatPromise = Promise.resolve();

    const renew = (phase?: IngestJobPhase) => {
      heartbeatPromise = heartbeatPromise.then(async () => {
        let result: 'cancelled' | 'lost' | 'renewed';
        try {
          result = await this.deps.repository.heartbeat({
            id: job.id,
            leaseMs: this.leaseMs,
            leaseToken: job.leaseToken,
            now: this.now(),
            phase,
          });
        } catch {
          throw new IngestJobError(
            'LEASE_RENEWAL_FAILED',
            'Processing paused because ownership could not be renewed.',
            true,
          );
        }
        if (result !== 'renewed') {
          throw new IngestJobError(
            result === 'cancelled' ? 'CANCELLED' : 'LEASE_LOST',
            result === 'cancelled' ? 'Processing cancelled.' : 'Processing ownership was lost.',
            result === 'lost',
          );
        }
        controller.signal.throwIfAborted();
      });
      return heartbeatPromise;
    };

    const timer = setInterval(() => {
      void renew().catch((error: unknown) => controller.abort(error));
    }, this.deps.heartbeatMs ?? 15_000);

    const stopHeartbeat = async () => {
      clearInterval(timer);
      await heartbeatPromise.catch(() => undefined);
    };

    try {
      controller.signal.throwIfAborted();
      const prepared = await this.deps.processing.prepare({
        job,
        onPhase: async (phase) => {
          try {
            await renew(phase);
          } catch (error) {
            controller.abort(error);
            throw error;
          }
        },
        signal: controller.signal,
      });
      await renew('publishing');
      await stopHeartbeat();
      controller.signal.throwIfAborted();
      const published = await this.deps.repository.publish({
        id: job.id,
        leaseToken: job.leaseToken,
        now: this.now(),
        prepared,
      });
      if (!published) {
        throw new IngestJobError('LEASE_LOST', 'Processing ownership was lost.', true);
      }
    } catch (error) {
      await stopHeartbeat();
      const failure = getIngestJobFailure(
        controller.signal.aborted ? controller.signal.reason : error,
      );
      if (failure.code === 'CANCELLED') {
        await this.deps.repository.cancelAttempt({
          id: job.id,
          leaseToken: job.leaseToken,
          now: this.now(),
        });
      } else {
        const delay = job.attemptCount === 1 ? 5_000 : 30_000;
        const retryAt = failure.retryable
          ? this.now() + delay + Math.floor((this.deps.random ?? Math.random)() * 1_000)
          : undefined;
        await this.deps.repository.fail({
          code: failure.code,
          id: job.id,
          leaseToken: job.leaseToken,
          message: failure.message,
          now: this.now(),
          retryAt,
        });
      }
    } finally {
      await stopHeartbeat();
      shutdownSignal?.removeEventListener('abort', interrupted);
      await this.deps.processing
        .cleanupAttempt(job)
        .catch((error: unknown) => this.deps.onError?.(error));
    }
    await this.cleanupSource();
  }

  private async cleanupSource(): Promise<void> {
    if (this.now() < this.nextCleanupAt) {
      return;
    }
    const job = await this.deps.repository.nextSourceCleanup();
    if (!job) {
      return;
    }
    try {
      await this.deps.processing.cleanupSource(job.sourcePath);
      await this.deps.repository.acknowledgeSourceCleanup(job.id);
    } catch (error) {
      this.nextCleanupAt = this.now() + 30_000;
      this.deps.onError?.(error);
    }
  }
}
