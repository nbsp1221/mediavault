import { ZodError } from 'zod';
import type { ManageIngestJobsUseCase } from '~/modules/ingest/application/use-cases/manage-ingest-jobs.usecase';
import { isIngestJobTerminal } from '~/modules/ingest/domain/ingest-job';
import { toIngestJobView } from '~/modules/ingest/domain/ingest-job-view';

interface RouteArgs {
  params: Record<string, string | undefined>;
  request: Request;
}

interface Dependencies {
  getJobs: () => Promise<
    Pick<ManageIngestJobsUseCase, 'accept' | 'cancel' | 'get' | 'list' | 'retry'>
  >;
  requireSession: (request: Request) => Promise<{ userId: string } | Response>;
}

export function createIngestJobHttpHandlers(deps: Dependencies) {
  const authenticated =
    (method: 'GET' | 'POST', execute: (args: RouteArgs, ownerId: string) => Promise<Response>) =>
    async (args: RouteArgs) => {
      if (args.request.method !== method && !(method === 'GET' && args.request.method === 'HEAD')) {
        return new Response(null, {
          headers: { 'Allow': method, 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' },
          status: 405,
        });
      }
      const session = await deps.requireSession(args.request);
      if (session instanceof Response) {
        return session;
      }
      try {
        return await execute(args, session.userId);
      } catch (error) {
        return error instanceof ZodError ||
          error instanceof SyntaxError ||
          error instanceof RangeError
          ? json({ error: 'Invalid processing request.', success: false }, 400)
          : json({ error: 'Video processing is temporarily unavailable.', success: false }, 503);
      }
    };

  return {
    commit: authenticated('POST', async ({ params, request }, ownerId) => {
      if (!params.stagingId) {
        return json({ error: 'Staged upload id is required', success: false }, 400);
      }
      const metadata = await readMetadata(request);
      const result = await (
        await deps.getJobs()
      ).accept({ metadata, ownerId, stagingId: params.stagingId });
      if (result.kind !== 'accepted') {
        const status = { conflict: 409, expired: 404, full: 503, missing: 404 }[result.kind];
        return json(
          {
            error:
              result.kind === 'full'
                ? 'The processing queue is full. Please try again shortly.'
                : 'The staged upload cannot be accepted for processing.',
            success: false,
          },
          status,
          result.kind === 'full' ? { 'Retry-After': '30' } : {},
        );
      }
      const view = toIngestJobView(result.job);
      return json({ job: view, success: true }, isIngestJobTerminal(result.job.state) ? 200 : 202, {
        Location: `/api/ingest-jobs/${encodeURIComponent(view.id)}`,
      });
    }),
    get: authenticated('GET', async ({ params }, ownerId) => {
      if (!params.jobId) {
        return json({ error: 'Job id is required.', success: false }, 400);
      }
      const job = await (await deps.getJobs()).get(params.jobId, ownerId);
      return job
        ? json({ job, success: true })
        : json({ error: 'Processing job not found.', success: false }, 404);
    }),
    list: authenticated('GET', async ({ request }, ownerId) => {
      const url = new URL(request.url);
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50 ||
        !Number.isInteger(offset) ||
        offset < 0
      ) {
        throw new RangeError('Invalid job pagination.');
      }
      const jobs = await (await deps.getJobs()).list(ownerId, { limit: limit + 1, offset });
      return json({ hasMore: jobs.length > limit, jobs: jobs.slice(0, limit), success: true });
    }),
    cancel: authenticated('POST', async ({ params }, ownerId) => {
      if (!params.jobId) {
        return json({ error: 'Job id is required.', success: false }, 400);
      }
      const result = await (await deps.getJobs()).cancel(params.jobId, ownerId);
      if (result.kind !== 'updated') {
        return json(
          { error: 'The processing job cannot be cancelled.', success: false },
          result.kind === 'missing' ? 404 : 409,
        );
      }
      return json(
        { job: toIngestJobView(result.job), success: true },
        result.job.state === 'running' ? 202 : 200,
      );
    }),
    retry: authenticated('POST', async ({ params, request }, ownerId) => {
      if (!params.jobId) {
        return json({ error: 'Job id is required.', success: false }, 400);
      }
      const result = await (
        await deps.getJobs()
      ).retry(params.jobId, ownerId, await readMetadata(request, true));
      if (result.kind === 'full') {
        return json(
          { error: 'The processing queue is full. Please try again later.', success: false },
          503,
          { 'Retry-After': '30' },
        );
      }
      if (result.kind !== 'updated') {
        return json(
          {
            code: result.kind,
            error:
              result.kind === 'source_missing'
                ? 'The source is unavailable. Please upload the file again.'
                : 'The processing job cannot be retried.',
            success: false,
          },
          result.kind === 'missing' ? 404 : 409,
        );
      }
      return json({ job: toIngestJobView(result.job), success: true }, 202);
    }),
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, {
    headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', ...headers },
    status,
  });
}

async function readMetadata(request: Request, optional = false): Promise<unknown> {
  if (!request.body) {
    return optional ? undefined : {};
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    length += value.byteLength;
    if (length > 65_536) {
      await reader.cancel();
      throw new RangeError('Processing metadata is too large.');
    }
    chunks.push(value);
  }
  if (optional && length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
