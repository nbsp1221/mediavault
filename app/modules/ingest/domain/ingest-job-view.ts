import { z } from 'zod';
import {
  INGEST_JOB_PHASES,
  INGEST_JOB_STATES,
  type IngestJob,
  ingestJobMetadataSchema,
} from '~/modules/ingest/domain/ingest-job';

export const ingestJobViewSchema = z.object({
  attemptCount: z.number().int().nonnegative(),
  canRetry: z.boolean(),
  cancelRequested: z.boolean(),
  createdAt: z.number(),
  error: z.object({ code: z.string(), message: z.string().nullable() }).nullable(),
  finishedAt: z.number().nullable(),
  id: z.string(),
  metadata: ingestJobMetadataSchema,
  nextRunAt: z.number(),
  phase: z.enum(INGEST_JOB_PHASES),
  stagingId: z.string(),
  state: z.enum(INGEST_JOB_STATES),
  updatedAt: z.number(),
  videoId: z.string().nullable(),
});

export type IngestJobView = z.infer<typeof ingestJobViewSchema>;

/** Browser-safe projection: never include filesystem locations, request hashes, ownership leases, or keys. */
export function toIngestJobView(job: IngestJob): IngestJobView {
  return {
    attemptCount: job.attemptCount,
    canRetry: job.state === 'failed' || job.state === 'cancelled',
    cancelRequested: job.cancelRequestedAt !== null,
    createdAt: job.createdAt,
    error: job.errorCode ? { code: job.errorCode, message: job.errorMessage } : null,
    finishedAt: job.finishedAt,
    id: job.id,
    metadata: job.metadata,
    nextRunAt: job.nextRunAt,
    phase: job.phase,
    stagingId: job.stagingId,
    state: job.state,
    updatedAt: job.updatedAt,
    videoId: job.state === 'succeeded' ? job.videoId : null,
  };
}
