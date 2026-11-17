import type {
  ClaimedIngestJob,
  IngestJobPhase,
  PreparedIngestJob,
} from '~/modules/ingest/domain/ingest-job';

export interface IngestJobProcessingPort {
  cleanupAttempt(job: ClaimedIngestJob): Promise<void>;
  cleanupSource(sourcePath: string): Promise<void>;
  prepare(input: {
    job: ClaimedIngestJob;
    onPhase: (phase: IngestJobPhase) => Promise<void>;
    signal: AbortSignal;
  }): Promise<PreparedIngestJob>;
}
