import path from 'node:path';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { type CreateMigratedPrimarySqliteDatabase, createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { getPrimaryStorageConfig } from '~/shared/config/app-config.server';
import type {
  CreateIngestStagedUploadInput,
  IngestStagedUploadRepositoryPort,
  UpdateIngestStagedUploadInput,
} from '../../application/ports/ingest-staged-upload-repository.port';
import type { IngestStagedUpload } from '../../domain/staged-upload';

interface SqliteIngestStagedUploadRepositoryAdapterDependencies {
  createDatabase?: CreateMigratedPrimarySqliteDatabase;
  dbPath?: string;
  storageDir?: string;
}

interface IngestStagedUploadRow {
  committed_video_id: string | null;
  created_at: string;
  expires_at: string;
  filename: string;
  mime_type: string;
  reserved_video_id: string | null;
  size_bytes: number;
  staging_id: string;
  status: IngestStagedUpload['status'];
  storage_relpath: string;
}

export class SqliteIngestStagedUploadRepositoryAdapter implements IngestStagedUploadRepositoryPort {
  private readonly createDatabase: CreateMigratedPrimarySqliteDatabase;
  private readonly dbPath: string;
  private readonly storageDir: string;
  private databasePromise: Promise<SqliteDatabaseAdapter> | null = null;

  constructor(deps: SqliteIngestStagedUploadRepositoryAdapterDependencies) {
    const config = getPrimaryStorageConfig();

    this.createDatabase = deps.createDatabase ?? createMigratedPrimarySqliteDatabase;
    this.dbPath = deps.dbPath ?? config.databasePath;
    this.storageDir = deps.storageDir ?? config.storageDir;
  }

  async create(upload: CreateIngestStagedUploadInput): Promise<IngestStagedUpload> {
    const database = await this.getDatabase();
    await database.prepare(`
      INSERT INTO ingest_uploads (
        staging_id,
        filename,
        mime_type,
        size_bytes,
        storage_relpath,
        status,
        created_at,
        updated_at,
        expires_at,
        reserved_video_id,
        committed_video_id,
        committed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      upload.stagingId,
      upload.filename,
      upload.mimeType,
      upload.size,
      this.toRelativeStoragePath(upload.storagePath),
      upload.status,
      upload.createdAt.toISOString(),
      upload.createdAt.toISOString(),
      upload.expiresAt.toISOString(),
      upload.committedVideoId ?? null,
      upload.status === 'committed' ? upload.committedVideoId ?? null : null,
      upload.status === 'committed' ? upload.createdAt.toISOString() : null,
    );

    const created = await this.findByStagingId(upload.stagingId);
    if (!created) {
      throw new Error(`Failed to create staged upload ${upload.stagingId}`);
    }

    return created;
  }

  async delete(stagingId: string): Promise<void> {
    const database = await this.getDatabase();
    await database.prepare(`
      DELETE FROM ingest_uploads
      WHERE staging_id = ?
    `).run(stagingId);
  }

  async findByStagingId(stagingId: string): Promise<IngestStagedUpload | null> {
    const database = await this.getDatabase();
    const row = await database.prepare<IngestStagedUploadRow>(`
      SELECT
        staging_id,
        filename,
        mime_type,
        size_bytes,
        storage_relpath,
        status,
        created_at,
        expires_at,
        reserved_video_id,
        committed_video_id
      FROM ingest_uploads
      WHERE staging_id = ?
    `).get(stagingId);

    return row ? this.mapRowToStagedUpload(row) : null;
  }

  async listExpired(referenceTime: Date): Promise<IngestStagedUpload[]> {
    const database = await this.getDatabase();
    const rows = await database.prepare<IngestStagedUploadRow>(`
      SELECT
        staging_id,
        filename,
        mime_type,
        size_bytes,
        storage_relpath,
        status,
        created_at,
        expires_at,
        reserved_video_id,
        committed_video_id
      FROM ingest_uploads
      WHERE expires_at < ?
        AND status != 'committed'
      ORDER BY created_at ASC
    `).all(referenceTime.toISOString());

    return rows.map(row => this.mapRowToStagedUpload(row));
  }

  async beginCommit(stagingId: string): Promise<'acquired' | 'already_committed' | 'already_committing' | 'missing'> {
    const database = await this.getDatabase();

    return database.transaction(async (transactionDatabase) => {
      const row = await transactionDatabase.prepare<Pick<IngestStagedUploadRow, 'status'>>(`
        SELECT status
        FROM ingest_uploads
        WHERE staging_id = ?
      `).get(stagingId);

      if (!row) {
        return 'missing';
      }

      if (row.status === 'committed') {
        return 'already_committed';
      }

      if (row.status === 'committing') {
        return 'already_committing';
      }

      await transactionDatabase.prepare(`
        UPDATE ingest_uploads
        SET status = 'committing',
            updated_at = ?
        WHERE staging_id = ?
      `).run(new Date().toISOString(), stagingId);

      return 'acquired';
    });
  }

  async reserveCommittedVideoId(stagingId: string, nextVideoId: string): Promise<string | null> {
    const database = await this.getDatabase();

    return database.transaction(async (transactionDatabase) => {
      const row = await transactionDatabase.prepare<Pick<IngestStagedUploadRow, 'reserved_video_id'>>(`
        SELECT reserved_video_id
        FROM ingest_uploads
        WHERE staging_id = ?
      `).get(stagingId);

      if (!row) {
        return null;
      }

      if (row.reserved_video_id) {
        return row.reserved_video_id;
      }

      await transactionDatabase.prepare(`
        UPDATE ingest_uploads
        SET reserved_video_id = ?,
            updated_at = ?
        WHERE staging_id = ?
      `).run(nextVideoId, new Date().toISOString(), stagingId);

      return nextVideoId;
    });
  }

  async update(stagingId: string, input: UpdateIngestStagedUploadInput): Promise<IngestStagedUpload | null> {
    const database = await this.getDatabase();
    const current = await this.findByStagingId(stagingId);

    if (!current) {
      return null;
    }

    await database.prepare(`
      UPDATE ingest_uploads
      SET
        status = ?,
        updated_at = ?,
        expires_at = ?,
        reserved_video_id = ?,
        committed_video_id = ?,
        committed_at = ?
      WHERE staging_id = ?
    `).run(
      input.status ?? current.status,
      new Date().toISOString(),
      (input.expiresAt ?? current.expiresAt).toISOString(),
      input.committedVideoId ?? current.committedVideoId ?? null,
      input.status === 'committed'
        ? input.committedVideoId ?? current.committedVideoId ?? null
        : null,
      input.status === 'committed' ? new Date().toISOString() : null,
      stagingId,
    );

    return this.findByStagingId(stagingId);
  }

  private async getDatabase(): Promise<SqliteDatabaseAdapter> {
    if (!this.databasePromise) {
      this.databasePromise = this.createDatabase({
        dbPath: this.dbPath,
      });
    }

    return this.databasePromise;
  }

  private mapRowToStagedUpload(row: IngestStagedUploadRow): IngestStagedUpload {
    return {
      committedVideoId: row.committed_video_id ?? row.reserved_video_id ?? undefined,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      filename: row.filename,
      mimeType: row.mime_type,
      size: row.size_bytes,
      stagingId: row.staging_id,
      status: row.status,
      storagePath: path.join(this.storageDir, row.storage_relpath),
    };
  }

  private toRelativeStoragePath(storagePath: string): string {
    const relativePath = path.relative(this.storageDir, storagePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Staged upload path must be inside storage root: ${storagePath}`);
    }

    return relativePath;
  }
}
