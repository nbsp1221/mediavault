import type { IngestJobView } from '~/modules/ingest/domain/ingest-job-view';

export function createIngestJobView(overrides: Partial<IngestJobView> = {}): IngestJobView {
  const state = overrides.state ?? 'queued';
  return {
    attemptCount: state === 'queued' ? 0 : 1,
    canRetry: state === 'failed' || state === 'cancelled',
    cancelRequested: false,
    createdAt: 1_000,
    error:
      state === 'failed'
        ? { code: 'PROCESSING_FAILED', message: 'Processing failed. Please retry.' }
        : null,
    finishedAt: state === 'succeeded' || state === 'failed' || state === 'cancelled' ? 2_000 : null,
    id: 'job-123',
    metadata: { genreSlugs: [], tags: [], title: 'Fixture video' },
    nextRunAt: 1_000,
    phase: state === 'running' ? 'preparing' : 'queued',
    stagingId: 'staging-123',
    state,
    updatedAt: state === 'queued' ? 1_000 : 2_000,
    videoId: state === 'succeeded' ? 'video-123' : null,
    ...overrides,
  };
}
