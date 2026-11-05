import type {
  ClaimedIngestJob,
  IngestJob,
  IngestJobMetadata,
  IngestJobPhase,
  PreparedIngestJob,
} from '~/modules/ingest/domain/ingest-job';

export type EnqueueIngestJobResult =
  | { job: IngestJob; kind: 'accepted' }
  | { kind: 'conflict' | 'expired' | 'full' | 'missing' };

export interface EnqueueIngestJobInput {
  capacity: number;
  id: string;
  metadata: IngestJobMetadata;
  now: number;
  ownerId: string;
  requestHash: string;
  stagingId: string;
  videoId: string;
}

export interface IngestJobLeaseInput {
  id: string;
  leaseToken: string;
  now: number;
}

export type IngestJobMutationResult =
  | { job: IngestJob; kind: 'updated' }
  | { kind: 'conflict' | 'full' | 'missing' };

export interface IngestJobRepositoryPort {
  acknowledgeSourceCleanup(id: string): Promise<void>;
  cancelAttempt(input: IngestJobLeaseInput): Promise<boolean>;
  claim(input: {
    leaseMs: number;
    leaseToken: string;
    now: number;
  }): Promise<ClaimedIngestJob | null>;
  enqueue(input: EnqueueIngestJobInput): Promise<EnqueueIngestJobResult>;
  fail(
    input: IngestJobLeaseInput & { code: string; message: string; retryAt?: number },
  ): Promise<boolean>;
  findOwned(id: string, ownerId: string): Promise<IngestJob | null>;
  hasActiveJobs(ownerId: string): Promise<boolean>;
  hasOwnedStage(stagingId: string, ownerId: string): Promise<boolean>;
  heartbeat(
    input: IngestJobLeaseInput & { leaseMs: number; phase?: IngestJobPhase },
  ): Promise<'cancelled' | 'lost' | 'renewed'>;
  listOwned(ownerId: string, pagination: { limit: number; offset: number }): Promise<IngestJob[]>;
  nextSourceCleanup(): Promise<IngestJob | null>;
  publish(input: IngestJobLeaseInput & { prepared: PreparedIngestJob }): Promise<boolean>;
  recoverExpired(now: number): Promise<void>;
  requestCancellation(input: {
    id: string;
    now: number;
    ownerId: string;
  }): Promise<IngestJobMutationResult>;
  retry(input: {
    id: string;
    metadata?: IngestJobMetadata;
    now: number;
    ownerId: string;
    requestHash?: string;
  }): Promise<IngestJobMutationResult>;
}
