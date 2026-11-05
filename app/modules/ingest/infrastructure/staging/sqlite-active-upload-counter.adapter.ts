import type { ActiveUploadCounterPort } from '~/modules/user/application/ports/active-upload-counter.port';
import { createInitializedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';

/** Preserve source ownership until its creator explicitly removes pending work. */
export class SqliteActiveUploadCounterAdapter implements ActiveUploadCounterPort {
  constructor(private readonly deps: { dbPath: string }) {}

  async countActiveUploads(ownerId: string): Promise<number> {
    const database = await createInitializedPrimarySqliteDatabase({ dbPath: this.deps.dbPath });
    const row = await database
      .prepare<{ count: number }>(`
      SELECT COUNT(*) AS count FROM ingest_uploads
      WHERE owner_id = ? AND (
        status IN ('uploaded', 'committing', 'failed', 'removing')
        OR EXISTS (SELECT 1 FROM ingest_jobs WHERE ingest_jobs.staging_id = ingest_uploads.staging_id AND (ingest_jobs.state IN ('queued', 'running') OR ingest_jobs.source_cleanup_pending = 1))
      )
    `)
      .get(ownerId);
    return row?.count ?? 0;
  }
}
