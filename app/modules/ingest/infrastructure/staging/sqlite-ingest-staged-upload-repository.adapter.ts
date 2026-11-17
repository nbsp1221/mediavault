import path from 'node:path';
import type {
  CreateIngestStagedUploadInput,
  IngestStagedUploadRepositoryPort,
} from '~/modules/ingest/application/ports/ingest-staged-upload-repository.port';
import type { IngestStagedUpload } from '~/modules/ingest/domain/staged-upload';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import {
  type CreateInitializedPrimarySqliteDatabase,
  createInitializedPrimarySqliteDatabase,
} from '~/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import { getPrimaryStorageConfig } from '~/shared/config/app-config.server';

interface Dependencies {
  createDatabase?: CreateInitializedPrimarySqliteDatabase;
  dbPath?: string;
  storageDir?: string;
}

interface UploadRow {
  committed_video_id: string | null;
  created_at: string;
  expires_at: string;
  filename: string;
  mime_type: string;
  owner_id: string;
  size_bytes: number;
  staging_id: string;
  status: IngestStagedUpload['status'];
  storage_relpath: string;
}

export class SqliteIngestStagedUploadRepositoryAdapter implements IngestStagedUploadRepositoryPort {
  private database: Promise<SqliteDatabaseAdapter> | null = null;
  private readonly dbPath: string;
  private readonly storageDir: string;

  constructor(private readonly deps: Dependencies) {
    const config = getPrimaryStorageConfig();
    this.dbPath = deps.dbPath ?? config.databasePath;
    this.storageDir = deps.storageDir ?? config.storageDir;
  }

  async create(upload: CreateIngestStagedUploadInput): Promise<IngestStagedUpload> {
    const database = await this.getDatabase();
    await database
      .prepare(`INSERT INTO ingest_uploads (
      staging_id, owner_id, filename, mime_type, size_bytes, storage_relpath, status,
      created_at, updated_at, expires_at, reserved_video_id, committed_video_id, committed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        upload.stagingId,
        upload.ownerId,
        upload.filename,
        upload.mimeType,
        upload.size,
        this.relativeSourcePath(upload.storagePath),
        upload.status,
        upload.createdAt.toISOString(),
        upload.createdAt.toISOString(),
        upload.expiresAt.toISOString(),
        upload.committedVideoId ?? null,
        upload.status === 'committed' ? (upload.committedVideoId ?? null) : null,
        upload.status === 'committed' ? upload.createdAt.toISOString() : null,
      );
    const result = await this.findByStagingId(upload.stagingId);
    if (!result) {
      throw new Error('Created staged upload could not be read.');
    }
    return result;
  }

  async beginRemoval(stagingId: string, ownerId: string): Promise<'acquired' | 'busy' | 'missing'> {
    return (await this.getDatabase()).transaction(async (db) => {
      const row = await db
        .prepare<UploadRow>('SELECT * FROM ingest_uploads WHERE staging_id = ? AND owner_id = ?')
        .get(stagingId, ownerId);
      if (!row) {
        return 'missing';
      }
      if (row.status !== 'uploaded' && row.status !== 'removing') {
        return 'busy';
      }
      const active = await db
        .prepare<{ id: string }>(
          "SELECT id FROM ingest_jobs WHERE staging_id = ? AND state IN ('queued', 'running') LIMIT 1",
        )
        .get(stagingId);
      if (active) {
        return 'busy';
      }
      await db
        .prepare(
          "UPDATE ingest_uploads SET status = 'removing', updated_at = ? WHERE staging_id = ?",
        )
        .run(new Date().toISOString(), stagingId);
      return 'acquired';
    });
  }

  async delete(stagingId: string): Promise<void> {
    await (
      await this.getDatabase()
    )
      .prepare('DELETE FROM ingest_uploads WHERE staging_id = ?')
      .run(stagingId);
  }

  async findByStagingId(stagingId: string): Promise<IngestStagedUpload | null> {
    const row = await (
      await this.getDatabase()
    )
      .prepare<UploadRow>('SELECT * FROM ingest_uploads WHERE staging_id = ?')
      .get(stagingId);
    return row ? this.map(row) : null;
  }

  async listExpired(referenceTime: Date): Promise<IngestStagedUpload[]> {
    const rows = await (
      await this.getDatabase()
    )
      .prepare<UploadRow>(`SELECT * FROM ingest_uploads
      WHERE expires_at < ? AND status != 'committed'
        AND NOT EXISTS (SELECT 1 FROM ingest_jobs WHERE ingest_jobs.staging_id = ingest_uploads.staging_id)
      ORDER BY created_at ASC`)
      .all(referenceTime.toISOString());
    return rows.map((row) => this.map(row));
  }

  private getDatabase(): Promise<SqliteDatabaseAdapter> {
    return (this.database ??= (this.deps.createDatabase ?? createInitializedPrimarySqliteDatabase)({
      dbPath: this.dbPath,
    }));
  }

  private map(row: UploadRow): IngestStagedUpload {
    return {
      committedVideoId: row.committed_video_id ?? undefined,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      filename: row.filename,
      mimeType: row.mime_type,
      ownerId: row.owner_id,
      size: row.size_bytes,
      stagingId: row.staging_id,
      status: row.status,
      storagePath: path.join(this.storageDir, row.storage_relpath),
    };
  }

  private relativeSourcePath(storagePath: string): string {
    const relative = path.relative(this.storageDir, storagePath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Staged upload path must be inside storage root.');
    }
    return relative;
  }
}
