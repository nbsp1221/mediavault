import { z } from 'zod';
import { videoTagsSchema } from '~/modules/library/domain/video-tag';

export const INGEST_JOB_STATES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;

export type IngestJobState = (typeof INGEST_JOB_STATES)[number];

export const INGEST_JOB_PHASES = [
  'queued',
  'probing',
  'preparing',
  'packaging',
  'thumbnail',
  'verifying',
  'publishing',
] as const;

export type IngestJobPhase = (typeof INGEST_JOB_PHASES)[number];

export const ingestJobMetadataSchema = z.object({
  contentTypeSlug: z.string().max(100).optional(),
  description: z.string().max(1_000).optional(),
  genreSlugs: z.array(z.string().max(100)).max(100).default([]),
  tags: videoTagsSchema.default([]),
  title: z.string().trim().min(1).max(200),
});

export type IngestJobMetadata = z.infer<typeof ingestJobMetadataSchema>;

export interface IngestJob {
  attemptCount: number;
  attemptsAllowed: number;
  cancelRequestedAt: number | null;
  createdAt: number;
  errorCode: string | null;
  errorMessage: string | null;
  finishedAt: number | null;
  id: string;
  leaseExpiresAt: number | null;
  leaseToken: string | null;
  metadata: IngestJobMetadata;
  nextRunAt: number;
  ownerId: string;
  phase: IngestJobPhase;
  requestHash: string;
  sourceCleanupPending: boolean;
  sourcePath: string;
  stagingId: string;
  state: IngestJobState;
  updatedAt: number;
  videoId: string;
}

export interface ClaimedIngestJob extends IngestJob {
  leaseExpiresAt: number;
  leaseToken: string;
  state: 'running';
}

export interface PreparedIngestJob {
  duration: number;
  strategy: string;
  workspacePath: string;
}

export class IngestJobError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'IngestJobError';
  }
}

export function getIngestJobFailure(error: unknown): IngestJobError {
  return error instanceof IngestJobError
    ? error
    : new IngestJobError(
        'PROCESSING_FAILED',
        'Video processing failed. Please retry after checking the media and server.',
      );
}

export function isClaimedIngestJob(job: IngestJob | null): job is ClaimedIngestJob {
  return (
    job !== null &&
    job.state === 'running' &&
    job.leaseToken !== null &&
    job.leaseExpiresAt !== null
  );
}

export function isIngestJobTerminal(state: IngestJobState): boolean {
  return state === 'succeeded' || state === 'failed' || state === 'cancelled';
}
