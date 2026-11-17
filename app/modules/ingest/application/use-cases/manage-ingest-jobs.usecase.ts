import { createHash, randomUUID } from 'node:crypto';
import type { IngestJobRepositoryPort } from '~/modules/ingest/application/ports/ingest-job-repository.port';
import {
  type IngestJobMetadata,
  ingestJobMetadataSchema,
} from '~/modules/ingest/domain/ingest-job';
import { toIngestJobView } from '~/modules/ingest/domain/ingest-job-view';
import {
  normalizeTaxonomySlug,
  normalizeTaxonomySlugs,
} from '~/modules/library/domain/video-taxonomy';

export function parseIngestJobMetadata(input: unknown): {
  metadata: IngestJobMetadata;
  requestHash: string;
} {
  const parsed = ingestJobMetadataSchema.parse(input);
  const metadata: IngestJobMetadata = {
    contentTypeSlug: parsed.contentTypeSlug
      ? (normalizeTaxonomySlug(parsed.contentTypeSlug) ?? undefined)
      : undefined,
    description: parsed.description?.trim() || undefined,
    genreSlugs: normalizeTaxonomySlugs(parsed.genreSlugs),
    tags: parsed.tags,
    title: parsed.title,
  };
  const canonical = {
    ...metadata,
    genreSlugs: [...metadata.genreSlugs].sort(),
    tags: [...metadata.tags].sort(),
  };
  return {
    metadata,
    requestHash: createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),
  };
}

interface Dependencies {
  createId?: () => string;
  isSourceAvailable: (sourcePath: string) => Promise<boolean>;
  now?: () => number;
  repository: Pick<
    IngestJobRepositoryPort,
    'enqueue' | 'findOwned' | 'hasOwnedStage' | 'listOwned' | 'requestCancellation' | 'retry'
  >;
  wake: () => void;
}

export class ManageIngestJobsUseCase {
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(private readonly deps: Dependencies) {
    this.now = deps.now ?? Date.now;
    this.createId = deps.createId ?? randomUUID;
  }

  async accept(input: { metadata: unknown; ownerId: string; stagingId: string }) {
    if (!(await this.deps.repository.hasOwnedStage(input.stagingId, input.ownerId))) {
      return { kind: 'missing' as const };
    }
    const normalized = parseIngestJobMetadata(input.metadata);
    const result = await this.deps.repository.enqueue({
      ...normalized,
      capacity: 21,
      id: this.createId(),
      now: this.now(),
      ownerId: input.ownerId,
      stagingId: input.stagingId,
      videoId: this.createId(),
    });
    if (result.kind === 'accepted') {
      this.deps.wake();
    }
    return result;
  }

  async get(id: string, ownerId: string) {
    const job = await this.deps.repository.findOwned(id, ownerId);
    return job ? toIngestJobView(job) : null;
  }

  async list(
    ownerId: string,
    pagination: { limit: number; offset: number } = { limit: 50, offset: 0 },
  ) {
    if (
      !Number.isInteger(pagination.limit) ||
      pagination.limit < 1 ||
      pagination.limit > 100 ||
      !Number.isInteger(pagination.offset) ||
      pagination.offset < 0
    ) {
      throw new RangeError('Invalid job pagination.');
    }
    return (await this.deps.repository.listOwned(ownerId, pagination)).map(toIngestJobView);
  }

  async cancel(id: string, ownerId: string) {
    const result = await this.deps.repository.requestCancellation({ id, now: this.now(), ownerId });
    if (result.kind === 'updated') {
      this.deps.wake();
    }
    return result;
  }

  async retry(id: string, ownerId: string, metadata?: unknown) {
    const job = await this.deps.repository.findOwned(id, ownerId);
    if (!job) {
      return { kind: 'missing' as const };
    }
    if (job.state !== 'failed' && job.state !== 'cancelled') {
      return { kind: 'conflict' as const };
    }
    if (!(await this.deps.isSourceAvailable(job.sourcePath))) {
      return { kind: 'source_missing' as const };
    }
    const normalized = metadata === undefined ? {} : parseIngestJobMetadata(metadata);
    const result = await this.deps.repository.retry({
      ...normalized,
      id,
      now: this.now(),
      ownerId,
    });
    if (result.kind === 'updated') {
      this.deps.wake();
    }
    return result;
  }
}
