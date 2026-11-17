import path from 'node:path';
import type {
  EnqueueIngestJobInput,
  EnqueueIngestJobResult,
  IngestJobLeaseInput,
  IngestJobMutationResult,
  IngestJobRepositoryPort,
} from '~/modules/ingest/application/ports/ingest-job-repository.port';
import type {
  ClaimedIngestJob,
  IngestJob,
  IngestJobMetadata,
  IngestJobPhase,
  IngestJobState,
  PreparedIngestJob,
} from '~/modules/ingest/domain/ingest-job';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import {
  IngestJobError,
  ingestJobMetadataSchema,
  isClaimedIngestJob,
} from '~/modules/ingest/domain/ingest-job';

interface JobRow {
  attempt_count: number;
  attempts_allowed: number;
  cancel_requested_at: number | null;
  created_at: number;
  error_code: string | null;
  error_message: string | null;
  finished_at: number | null;
  id: string;
  lease_expires_at: number | null;
  lease_token: string | null;
  metadata_json: string;
  next_run_at: number;
  owner_id: string;
  phase: IngestJobPhase;
  request_hash: string;
  reserved_video_id: string;
  source_cleanup_pending: number;
  staging_id: string;
  state: IngestJobState;
  storage_relpath: string;
  updated_at: number;
}

interface StageRow {
  expires_at: string;
  owner_id: string;
  reserved_video_id: string | null;
  status: string;
}

interface Dependencies {
  database: SqliteDatabaseAdapter;
  promoteArtifacts: (job: ClaimedIngestJob, prepared: PreparedIngestJob) => Promise<void>;
  storageDir: string;
}

const selectJob = `SELECT jobs.*, uploads.storage_relpath
  FROM ingest_jobs AS jobs
  INNER JOIN ingest_uploads AS uploads ON uploads.staging_id = jobs.staging_id`;

export class SqliteIngestJobRepository implements IngestJobRepositoryPort {
  constructor(private readonly deps: Dependencies) {}

  async enqueue(input: EnqueueIngestJobInput): Promise<EnqueueIngestJobResult> {
    return this.deps.database.transaction(async (db) => {
      const stage = await db
        .prepare<StageRow>(
          'SELECT owner_id, status, expires_at, reserved_video_id FROM ingest_uploads WHERE staging_id = ?',
        )
        .get(input.stagingId);
      if (!stage || stage.owner_id !== input.ownerId) {
        return { kind: 'missing' };
      }
      const existing = await db
        .prepare<JobRow>(`${selectJob} WHERE jobs.staging_id = ?`)
        .get(input.stagingId);
      if (existing) {
        return existing.request_hash === input.requestHash
          ? { job: this.map(existing), kind: 'accepted' }
          : { kind: 'conflict' };
      }
      if (stage.status !== 'uploaded') {
        return { kind: 'conflict' };
      }
      if (Date.parse(stage.expires_at) <= input.now) {
        return { kind: 'expired' };
      }
      const active = await db
        .prepare<{ count: number }>(
          "SELECT COUNT(*) AS count FROM ingest_jobs WHERE state IN ('queued', 'running')",
        )
        .get();
      if ((active?.count ?? 0) >= input.capacity) {
        return { kind: 'full' };
      }
      const videoId = stage.reserved_video_id ?? input.videoId;
      await db
        .prepare(`INSERT INTO ingest_jobs (
        id, staging_id, owner_id, reserved_video_id, state, phase, metadata_json,
        request_hash, next_run_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'queued', 'queued', ?, ?, ?, ?, ?)`)
        .run(
          input.id,
          input.stagingId,
          input.ownerId,
          videoId,
          JSON.stringify(input.metadata),
          input.requestHash,
          input.now,
          input.now,
          input.now,
        );
      await db
        .prepare(
          "UPDATE ingest_uploads SET status = 'committing', reserved_video_id = ?, updated_at = ? WHERE staging_id = ?",
        )
        .run(videoId, new Date(input.now).toISOString(), input.stagingId);
      const job = await this.findIn(db, input.id);
      if (!job) {
        throw new Error('Accepted ingest job could not be read');
      }
      return { job, kind: 'accepted' };
    });
  }

  async findOwned(id: string, ownerId: string): Promise<IngestJob | null> {
    const row = await this.deps.database
      .prepare<JobRow>(`${selectJob} WHERE jobs.id = ? AND jobs.owner_id = ?`)
      .get(id, ownerId);
    return row ? this.map(row) : null;
  }

  async hasOwnedStage(stagingId: string, ownerId: string): Promise<boolean> {
    return Boolean(
      await this.deps.database
        .prepare<{ staging_id: string }>(
          'SELECT staging_id FROM ingest_uploads WHERE staging_id = ? AND owner_id = ?',
        )
        .get(stagingId, ownerId),
    );
  }

  async hasActiveJobs(ownerId: string): Promise<boolean> {
    return Boolean(
      await this.deps.database
        .prepare<{ id: string }>(
          "SELECT id FROM ingest_jobs WHERE owner_id = ? AND state IN ('queued', 'running') LIMIT 1",
        )
        .get(ownerId),
    );
  }

  async listOwned(
    ownerId: string,
    pagination: { limit: number; offset: number },
  ): Promise<IngestJob[]> {
    const rows = await this.deps.database
      .prepare<JobRow>(
        `${selectJob} WHERE jobs.owner_id = ? ORDER BY CASE WHEN jobs.state IN ('queued', 'running') THEN 0 ELSE 1 END, jobs.created_at DESC, jobs.id DESC LIMIT ? OFFSET ?`,
      )
      .all(ownerId, pagination.limit, pagination.offset);
    return rows.map((row) => this.map(row));
  }

  async recoverExpired(now: number): Promise<void> {
    const expired = await this.deps.database
      .prepare<{ id: string }>(
        "SELECT id FROM ingest_jobs WHERE state = 'running' AND lease_expires_at <= ? LIMIT 1",
      )
      .get(now);
    if (!expired) {
      return;
    }
    await this.deps.database.transaction(async (db) => {
      await db
        .prepare(`UPDATE ingest_jobs SET
      state = CASE WHEN cancel_requested_at IS NOT NULL THEN 'cancelled' WHEN attempt_count >= attempts_allowed THEN 'failed' ELSE 'queued' END,
      phase = 'queued', lease_token = NULL, lease_expires_at = NULL,
      error_code = CASE WHEN cancel_requested_at IS NOT NULL THEN 'CANCELLED' ELSE 'PROCESSING_INTERRUPTED' END,
      error_message = CASE WHEN cancel_requested_at IS NOT NULL THEN 'Processing cancelled.' ELSE 'Processing was interrupted by a server restart or lost worker.' END,
      finished_at = CASE WHEN cancel_requested_at IS NOT NULL OR attempt_count >= attempts_allowed THEN ? ELSE NULL END,
      next_run_at = ?, updated_at = ?
      WHERE state = 'running' AND lease_expires_at <= ?`)
        .run(now, now + 5_000, now, now);
      await this.releaseTerminalStages(db);
    });
  }

  async claim(input: {
    leaseMs: number;
    leaseToken: string;
    now: number;
  }): Promise<ClaimedIngestJob | null> {
    const eligible = await this.deps.database
      .prepare<{ id: string }>(
        "SELECT id FROM ingest_jobs WHERE state = 'queued' AND next_run_at <= ? ORDER BY next_run_at, created_at, id LIMIT 1",
      )
      .get(input.now);
    if (!eligible) {
      return null;
    }
    return this.deps.database.transaction(async (db) => {
      const result = await db
        .prepare(`UPDATE ingest_jobs SET state = 'running', phase = 'probing',
        attempt_count = attempt_count + 1, lease_token = ?, lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND state = 'queued' AND next_run_at <= ? AND attempt_count < attempts_allowed`)
        .run(input.leaseToken, input.now + input.leaseMs, input.now, eligible.id, input.now);
      if (result.changes !== 1) {
        return null;
      }
      const job = await this.findIn(db, eligible.id);
      if (!isClaimedIngestJob(job)) {
        throw new Error('Claimed ingest job has an invalid lease.');
      }
      return job;
    });
  }

  async heartbeat(
    input: IngestJobLeaseInput & { leaseMs: number; phase?: IngestJobPhase },
  ): Promise<'cancelled' | 'lost' | 'renewed'> {
    const result = await this.deps.database
      .prepare(`UPDATE ingest_jobs SET lease_expires_at = ?, updated_at = ?, phase = COALESCE(?, phase)
      WHERE id = ? AND state = 'running' AND lease_token = ? AND lease_expires_at > ? AND cancel_requested_at IS NULL`)
      .run(
        input.now + input.leaseMs,
        input.now,
        input.phase ?? null,
        input.id,
        input.leaseToken,
        input.now,
      );
    if (result.changes === 1) {
      return 'renewed';
    }
    const row = await this.deps.database
      .prepare<{ cancel_requested_at: number | null }>(
        "SELECT cancel_requested_at FROM ingest_jobs WHERE id = ? AND state = 'running' AND lease_token = ? AND lease_expires_at > ?",
      )
      .get(input.id, input.leaseToken, input.now);
    return row && row.cancel_requested_at !== null ? 'cancelled' : 'lost';
  }

  async requestCancellation(input: {
    id: string;
    now: number;
    ownerId: string;
  }): Promise<IngestJobMutationResult> {
    return this.deps.database.transaction(async (db) => {
      const job = await this.findIn(db, input.id);
      if (!job || job.ownerId !== input.ownerId) {
        return { kind: 'missing' };
      }
      if (job.state === 'succeeded' || job.state === 'failed') {
        return { kind: 'conflict' };
      }
      await db
        .prepare(`UPDATE ingest_jobs SET cancel_requested_at = COALESCE(cancel_requested_at, ?), updated_at = ?,
        state = CASE WHEN state = 'queued' THEN 'cancelled' ELSE state END,
        finished_at = CASE WHEN state = 'queued' THEN ? ELSE finished_at END
        WHERE id = ?`)
        .run(input.now, input.now, input.now, input.id);
      await this.releaseTerminalStages(db);
      return { job: await this.requireIn(db, input.id), kind: 'updated' };
    });
  }

  async cancelAttempt(input: IngestJobLeaseInput): Promise<boolean> {
    return this.deps.database.transaction(async (db) => {
      const result = await db
        .prepare(`UPDATE ingest_jobs SET state = 'cancelled', lease_token = NULL, lease_expires_at = NULL,
        error_code = 'CANCELLED', error_message = 'Processing cancelled.', updated_at = ?, finished_at = ?
        WHERE id = ? AND state = 'running' AND lease_token = ? AND lease_expires_at > ?`)
        .run(input.now, input.now, input.id, input.leaseToken, input.now);
      if (result.changes === 1) {
        await this.releaseTerminalStages(db);
      }
      return result.changes === 1;
    });
  }

  async fail(
    input: IngestJobLeaseInput & { code: string; message: string; retryAt?: number },
  ): Promise<boolean> {
    return this.deps.database.transaction(async (db) => {
      const result = await db
        .prepare(`UPDATE ingest_jobs SET
      state = CASE WHEN cancel_requested_at IS NOT NULL THEN 'cancelled' WHEN ? IS NOT NULL AND attempt_count < attempts_allowed THEN 'queued' ELSE 'failed' END,
      phase = 'queued', lease_token = NULL, lease_expires_at = NULL,
      next_run_at = COALESCE(?, next_run_at), error_code = ?, error_message = ?, updated_at = ?,
      finished_at = CASE WHEN cancel_requested_at IS NULL AND ? IS NOT NULL AND attempt_count < attempts_allowed THEN NULL ELSE ? END
      WHERE id = ? AND state = 'running' AND lease_token = ? AND lease_expires_at > ?`)
        .run(
          input.retryAt ?? null,
          input.retryAt ?? null,
          input.code,
          input.message,
          input.now,
          input.retryAt ?? null,
          input.now,
          input.id,
          input.leaseToken,
          input.now,
        );
      if (result.changes === 1) {
        await this.releaseTerminalStages(db);
      }
      return result.changes === 1;
    });
  }

  async retry(input: {
    id: string;
    metadata?: IngestJobMetadata;
    now: number;
    ownerId: string;
    requestHash?: string;
  }): Promise<IngestJobMutationResult> {
    return this.deps.database.transaction(async (db) => {
      const job = await this.findIn(db, input.id);
      if (!job || job.ownerId !== input.ownerId) {
        return { kind: 'missing' };
      }
      if (job.state !== 'failed' && job.state !== 'cancelled') {
        return { kind: 'conflict' };
      }
      const stage = await db
        .prepare<{ status: string }>('SELECT status FROM ingest_uploads WHERE staging_id = ?')
        .get(job.stagingId);
      if (stage?.status !== 'uploaded') {
        return { kind: 'conflict' };
      }
      const active = await db
        .prepare<{ count: number }>(
          "SELECT COUNT(*) AS count FROM ingest_jobs WHERE state IN ('queued', 'running')",
        )
        .get();
      if ((active?.count ?? 0) >= 21) {
        return { kind: 'full' };
      }
      await db
        .prepare(`UPDATE ingest_jobs SET state = 'queued', phase = 'queued', attempts_allowed = attempt_count + 3,
        next_run_at = ?, cancel_requested_at = NULL, finished_at = NULL, error_code = NULL, error_message = NULL,
        metadata_json = ?, request_hash = ?, updated_at = ? WHERE id = ?`)
        .run(
          input.now,
          JSON.stringify(input.metadata ?? job.metadata),
          input.requestHash ?? job.requestHash,
          input.now,
          input.id,
        );
      await db
        .prepare(
          "UPDATE ingest_uploads SET status = 'committing', updated_at = ? WHERE staging_id = ?",
        )
        .run(new Date(input.now).toISOString(), job.stagingId);
      return { job: await this.requireIn(db, input.id), kind: 'updated' };
    });
  }

  async publish(input: IngestJobLeaseInput & { prepared: PreparedIngestJob }): Promise<boolean> {
    return this.deps.database.transaction(async (db) => {
      const job = await this.findIn(db, input.id);
      if (
        !isClaimedIngestJob(job) ||
        job.leaseToken !== input.leaseToken ||
        job.leaseExpiresAt <= input.now ||
        job.cancelRequestedAt !== null
      ) {
        return false;
      }
      const existing = await db
        .prepare<{ id: string }>('SELECT id FROM videos WHERE id = ?')
        .get(job.videoId);
      if (existing) {
        throw new IngestJobError(
          'PUBLICATION_CONFLICT',
          'A video already exists for this processing job.',
        );
      }
      if (!Number.isFinite(input.prepared.duration) || input.prepared.duration < 0) {
        throw new IngestJobError('INVALID_MEDIA', 'The uploaded video has an invalid duration.');
      }
      // Only the fenced owner can promote. The one local rename is the sole filesystem operation inside this transaction.
      await this.deps.promoteArtifacts(job, input.prepared);
      const timestamp = new Date(input.now).toISOString();
      await db
        .prepare(`INSERT INTO videos (id, title, description, duration_seconds, content_type_slug, owner_id, visibility, created_at, updated_at, sort_index)
        VALUES (?, ?, ?, ?, ?, ?, 'private', ?, ?, COALESCE((SELECT MAX(sort_index) FROM videos), 0) + 1)`)
        .run(
          job.videoId,
          job.metadata.title,
          job.metadata.description ?? null,
          input.prepared.duration,
          job.metadata.contentTypeSlug ?? null,
          job.ownerId,
          timestamp,
          timestamp,
        );
      for (const tag of job.metadata.tags) {
        await db
          .prepare(
            'INSERT INTO tags (slug, label, created_at) VALUES (?, ?, ?) ON CONFLICT(slug) DO NOTHING',
          )
          .run(tag, tag, timestamp);
        await db
          .prepare('INSERT INTO video_tags (video_id, tag_slug) VALUES (?, ?)')
          .run(job.videoId, tag);
      }
      for (const genre of job.metadata.genreSlugs) {
        await db
          .prepare('INSERT INTO video_genre_assignments (video_id, genre_slug) VALUES (?, ?)')
          .run(job.videoId, genre);
      }
      await db
        .prepare(`INSERT INTO video_media_assets (video_id, layout_version, status, preparation_strategy, manifest_relpath, key_relpath,
        thumbnail_relpath, video_init_relpath, video_segment_glob, audio_init_relpath, audio_segment_glob, prepared_at)
        VALUES (?, 1, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          job.videoId,
          input.prepared.strategy,
          `${job.videoId}/manifest.mpd`,
          `${job.videoId}/key.bin`,
          `${job.videoId}/thumbnail.jpg`,
          `${job.videoId}/video/init.mp4`,
          `${job.videoId}/video/segment-*.m4s`,
          `${job.videoId}/audio/init.mp4`,
          `${job.videoId}/audio/segment-*.m4s`,
          timestamp,
        );
      await db
        .prepare(
          "UPDATE ingest_uploads SET status = 'committed', committed_video_id = ?, committed_at = ?, updated_at = ? WHERE staging_id = ?",
        )
        .run(job.videoId, timestamp, timestamp, job.stagingId);
      await db
        .prepare(`UPDATE ingest_jobs SET state = 'succeeded', phase = 'publishing', lease_token = NULL, lease_expires_at = NULL,
        source_cleanup_pending = 1, updated_at = ?, finished_at = ?, error_code = NULL, error_message = NULL WHERE id = ?`)
        .run(input.now, input.now, job.id);
      return true;
    });
  }

  async nextSourceCleanup(): Promise<IngestJob | null> {
    const row = await this.deps.database
      .prepare<JobRow>(
        `${selectJob} WHERE jobs.state = 'succeeded' AND jobs.source_cleanup_pending = 1 ORDER BY jobs.finished_at LIMIT 1`,
      )
      .get();
    return row ? this.map(row) : null;
  }

  async acknowledgeSourceCleanup(id: string): Promise<void> {
    await this.deps.database.transaction(async (database) => {
      // Video deletion retained this source intent in removing state. Retire it only
      // after unlink succeeds, and never remove history for an existing ready video.
      await database
        .prepare(`
        DELETE FROM ingest_uploads
        WHERE status = 'removing' AND committed_video_id IS NULL AND staging_id = (
          SELECT jobs.staging_id FROM ingest_jobs AS jobs
          WHERE jobs.id = ? AND jobs.state = 'succeeded' AND jobs.source_cleanup_pending = 1
            AND NOT EXISTS (SELECT 1 FROM videos WHERE videos.id = jobs.reserved_video_id)
        )
      `)
        .run(id);
      await database
        .prepare(
          "UPDATE ingest_jobs SET source_cleanup_pending = 0 WHERE id = ? AND state = 'succeeded'",
        )
        .run(id);
    });
  }

  private async releaseTerminalStages(database: SqliteDatabaseAdapter): Promise<void> {
    await database
      .prepare(`UPDATE ingest_uploads SET status = 'uploaded' WHERE status = 'committing'
      AND EXISTS (SELECT 1 FROM ingest_jobs WHERE ingest_jobs.staging_id = ingest_uploads.staging_id AND ingest_jobs.state IN ('failed', 'cancelled'))`)
      .run();
  }

  private async requireIn(database: SqliteDatabaseAdapter, id: string): Promise<IngestJob> {
    const job = await this.findIn(database, id);
    if (!job) {
      throw new Error('Updated ingest job could not be read.');
    }
    return job;
  }

  private async findIn(database: SqliteDatabaseAdapter, id: string): Promise<IngestJob | null> {
    const row = await database.prepare<JobRow>(`${selectJob} WHERE jobs.id = ?`).get(id);
    return row ? this.map(row) : null;
  }

  private map(row: JobRow): IngestJob {
    const root = path.resolve(this.deps.storageDir);
    const sourcePath = path.resolve(root, row.storage_relpath);
    if (!sourcePath.startsWith(`${root}${path.sep}`)) {
      throw new IngestJobError('INVALID_SOURCE_PATH', 'The staged source path is invalid.');
    }
    return {
      attemptCount: row.attempt_count,
      attemptsAllowed: row.attempts_allowed,
      cancelRequestedAt: row.cancel_requested_at,
      createdAt: row.created_at,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      finishedAt: row.finished_at,
      id: row.id,
      leaseExpiresAt: row.lease_expires_at,
      leaseToken: row.lease_token,
      metadata: ingestJobMetadataSchema.parse(JSON.parse(row.metadata_json)),
      nextRunAt: row.next_run_at,
      ownerId: row.owner_id,
      phase: row.phase,
      requestHash: row.request_hash,
      sourceCleanupPending: row.source_cleanup_pending === 1,
      sourcePath,
      stagingId: row.staging_id,
      state: row.state,
      updatedAt: row.updated_at,
      videoId: row.reserved_video_id,
    };
  }
}
