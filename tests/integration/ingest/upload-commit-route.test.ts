import { describe, expect, test, vi } from 'vitest';
import type { IngestJobRepositoryPort } from '../../../app/modules/ingest/application/ports/ingest-job-repository.port';
import type { IngestJob } from '../../../app/modules/ingest/domain/ingest-job';
import { ManageIngestJobsUseCase } from '../../../app/modules/ingest/application/use-cases/manage-ingest-jobs.usecase';
import { createIngestJobHttpHandlers } from '../../../app/routes/.server/ingest-job-http-handlers';

const job: IngestJob = {
  attemptCount: 0,
  attemptsAllowed: 3,
  cancelRequestedAt: null,
  createdAt: 1,
  errorCode: null,
  errorMessage: null,
  finishedAt: null,
  id: 'job-123',
  leaseExpiresAt: null,
  leaseToken: null,
  metadata: { title: 'Video', tags: [], genreSlugs: [] },
  nextRunAt: 1,
  ownerId: 'owner-1',
  phase: 'queued',
  requestHash: 'private-hash',
  sourceCleanupPending: false,
  sourcePath: '/private/storage/source.mp4',
  stagingId: 'stage-123',
  state: 'queued',
  updatedAt: 1,
  videoId: 'video-123',
};

function request(
  body: unknown = { title: 'Video' },
  method = 'POST',
  url = 'http://localhost/api/uploads/stage-123/commit',
) {
  const init: RequestInit = { headers: { 'Content-Type': 'application/json' }, method };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

function fixture() {
  const repository = {
    acknowledgeSourceCleanup: vi.fn(),
    cancelAttempt: vi.fn(),
    claim: vi.fn(),
    enqueue: vi.fn<IngestJobRepositoryPort['enqueue']>(async () => ({ job, kind: 'accepted' })),
    fail: vi.fn(),
    findOwned: vi.fn(async (_id: string, ownerId: string) =>
      ownerId === job.ownerId ? job : null,
    ),
    hasActiveJobs: vi.fn(),
    hasOwnedStage: vi.fn(async () => true),
    heartbeat: vi.fn(),
    listOwned: vi.fn(async () => [job]),
    nextSourceCleanup: vi.fn(),
    publish: vi.fn(),
    recoverExpired: vi.fn(),
    requestCancellation: vi.fn(async () => ({
      job: { ...job, state: 'cancelled' as const },
      kind: 'updated' as const,
    })),
    retry: vi.fn<IngestJobRepositoryPort['retry']>(async () => ({ job, kind: 'updated' })),
  } satisfies IngestJobRepositoryPort;
  const jobs = new ManageIngestJobsUseCase({
    isSourceAvailable: async () => true,
    repository,
    wake: vi.fn(),
  });
  const getJobs = vi.fn(async () => jobs);
  const requireSession = vi.fn(async (): Promise<Response | { userId: string }> => ({
    userId: 'owner-1',
  }));
  const handlers = createIngestJobHttpHandlers({ getJobs, requireSession });
  const commit = handlers.commit;
  return { commit, getJobs, handlers, repository, requireSession };
}

describe('durable upload commit HTTP contract', () => {
  test('returns truthful 202, stable status URL and private job view rather than premature success', async () => {
    const f = fixture();
    const response = await f.commit({ params: { stagingId: 'stage-123' }, request: request() });
    expect(response.status).toBe(202);
    expect(response.headers.get('Location')).toBe('/api/ingest-jobs/job-123');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Vary')).toBe('Cookie');
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      success: true,
      job: { id: 'job-123', state: 'queued', videoId: null },
    });
    expect(JSON.stringify(body)).not.toMatch(/private-hash|storage\/source|leaseToken/);
  });

  test('uses session creator and validates metadata while ignoring spoofed owner and removed encoding options', async () => {
    const f = fixture();
    const response = await f.commit({
      params: { stagingId: 'stage-123' },
      request: request({
        title: ' Video ',
        contentTypeSlug: 'movie',
        tags: ['Some Tag'],
        ownerId: 'attacker',
        encodingOptions: { encoder: 'gpu-h265' },
      }),
    });
    expect(response.status).toBe(202);
    expect(f.repository.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'owner-1',
        stagingId: 'stage-123',
        metadata: {
          title: 'Video',
          tags: ['some tag'],
          contentTypeSlug: 'movie',
          genreSlugs: [],
          description: undefined,
        },
      }),
    );
    expect(f.repository.enqueue.mock.calls[0][0].metadata).not.toHaveProperty('ownerId');
    expect(f.repository.enqueue.mock.calls[0][0].metadata).not.toHaveProperty('encodingOptions');
  });

  test('neutral 404 precedes invalid metadata for missing or other-owner stage', async () => {
    const f = fixture();
    f.repository.hasOwnedStage.mockResolvedValue(false);
    const response = await f.commit({
      params: { stagingId: 'private-stage' },
      request: request({ title: '' }),
    });
    expect(response.status).toBe(404);
    expect(f.repository.enqueue).not.toHaveBeenCalled();
  });

  test('authenticates before reading body/services and rejects unsupported method', async () => {
    const f = fixture();
    f.requireSession.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    expect((await f.commit({ params: { stagingId: 'stage' }, request: request() })).status).toBe(
      401,
    );
    expect(f.getJobs).not.toHaveBeenCalled();
    expect(
      (await f.commit({ params: { stagingId: 'stage' }, request: request(undefined, 'DELETE') }))
        .status,
    ).toBe(405);
  });

  test('missing id, invalid body, oversized metadata and validation failures are 400 without queue work', async () => {
    const f = fixture();
    expect((await f.commit({ params: {}, request: request() })).status).toBe(400);
    expect(
      (await f.commit({ params: { stagingId: 'stage' }, request: request({ title: ' ' }) })).status,
    ).toBe(400);
    expect(
      (
        await f.commit({
          params: { stagingId: 'stage' },
          request: request({ title: 'Video', tags: [42] }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await f.commit({
          params: { stagingId: 'stage' },
          request: request({ title: 'Video', description: 'x'.repeat(70_000) }),
        })
      ).status,
    ).toBe(400);
    const malformed = new Request('http://localhost/api/uploads/stage/commit', {
      body: '{',
      method: 'POST',
    });
    expect((await f.commit({ params: { stagingId: 'stage' }, request: malformed })).status).toBe(
      400,
    );
    expect(f.repository.enqueue).not.toHaveBeenCalled();
  });

  test.each([
    ['missing', 404],
    ['expired', 404],
    ['conflict', 409],
    ['full', 503],
  ] as const)('maps %s without leaking private details', async (kind, status) => {
    const f = fixture();
    f.repository.enqueue.mockResolvedValue({ kind });
    const response = await f.commit({ params: { stagingId: 'stage' }, request: request() });
    expect(response.status).toBe(status);
    expect(response.headers.get('Retry-After')).toBe(kind === 'full' ? '30' : null);
  });

  test('retry admission exhaustion is 503 with Retry-After, not a false conflict or success', async () => {
    const f = fixture();
    f.repository.findOwned.mockResolvedValue({ ...job, state: 'failed' });
    f.repository.retry.mockResolvedValue({ kind: 'full' });
    const response = await f.handlers.retry({ params: { jobId: job.id }, request: request() });
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('30');
  });

  test('replays completed publication as 200 with the same video identity', async () => {
    const f = fixture();
    f.repository.enqueue.mockResolvedValue({
      job: { ...job, state: 'succeeded' },
      kind: 'accepted',
    });
    const response = await f.commit({ params: { stagingId: 'stage' }, request: request() });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ job: { videoId: 'video-123' } });
  });

  test('unexpected storage errors return safe retryable availability response', async () => {
    const f = fixture();
    f.repository.enqueue.mockRejectedValue(new Error('private path and encryption configuration'));
    const response = await f.commit({ params: { stagingId: 'stage' }, request: request() });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private path');
  });
});

describe('owner job monitor and control HTTP contracts', () => {
  test('status is read-only, owner scoped and missing id is rejected', async () => {
    const f = fixture();
    const read = request(undefined, 'GET', 'http://localhost/api/ingest-jobs/job-123');
    expect((await f.handlers.get({ params: { jobId: 'job-123' }, request: read })).status).toBe(
      200,
    );
    f.requireSession.mockResolvedValue({ userId: 'other-owner' });
    expect((await f.handlers.get({ params: { jobId: 'job-123' }, request: read })).status).toBe(
      404,
    );
    expect((await f.handlers.get({ params: {}, request: read })).status).toBe(400);
    expect(f.repository.enqueue).not.toHaveBeenCalled();
    expect(f.repository.retry).not.toHaveBeenCalled();
  });

  test('list bounds pagination and reports exact hasMore with one lookahead', async () => {
    const f = fixture();

    const read = (query: string) =>
      request(undefined, 'GET', `http://localhost/api/ingest-jobs?${query}`);

    f.repository.listOwned.mockResolvedValue([job, { ...job, id: 'job-2' }]);
    const response = await f.handlers.list({ params: {}, request: read('limit=1&offset=0') });
    expect(await response.json()).toMatchObject({ hasMore: true, jobs: [{ id: 'job-123' }] });
    expect((await f.handlers.list({ params: {}, request: read('limit=1000') })).status).toBe(400);
    expect((await f.handlers.list({ params: {}, request: read('offset=-1') })).status).toBe(400);
  });

  test('queued cancel and retry use trusted owner and never duplicate accepted work', async () => {
    const f = fixture();
    const cancel = await f.handlers.cancel({
      params: { jobId: 'job-123' },
      request: request({}, 'POST', 'http://localhost/api/ingest-jobs/job-123/cancel'),
    });
    expect(cancel.status).toBe(200);
    f.repository.findOwned.mockResolvedValue({ ...job, state: 'failed' });
    const retry = await f.handlers.retry({
      params: { jobId: 'job-123' },
      request: new Request('http://localhost/api/ingest-jobs/job-123/retry', { method: 'POST' }),
    });
    expect(retry.status).toBe(202);
    expect(f.repository.retry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-123', ownerId: 'owner-1' }),
    );
    expect(f.repository.enqueue).not.toHaveBeenCalled();
  });
});
