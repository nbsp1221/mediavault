import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import type { OwnedVideoCounterPort } from '~/modules/user/application/ports/owned-video-counter.port';
import { type CreateMigratedPrimarySqliteDatabase, createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { getPrimaryStorageConfig } from '~/shared/config/app-config.server';

interface SqliteOwnedVideoCounterAdapterOptions {
  createDatabase?: CreateMigratedPrimarySqliteDatabase;
  dbPath?: string;
}

export class SqliteOwnedVideoCounterAdapter implements OwnedVideoCounterPort {
  private readonly createDatabase: CreateMigratedPrimarySqliteDatabase;
  private readonly dbPath: string;
  private databasePromise: Promise<SqliteDatabaseAdapter> | null = null;

  constructor(options: SqliteOwnedVideoCounterAdapterOptions = {}) {
    this.createDatabase = options.createDatabase ?? createMigratedPrimarySqliteDatabase;
    this.dbPath = options.dbPath ?? getPrimaryStorageConfig().databasePath;
  }

  private async getDatabase(): Promise<SqliteDatabaseAdapter> {
    if (!this.databasePromise) {
      this.databasePromise = this.createDatabase({
        dbPath: this.dbPath,
      });
    }

    return this.databasePromise;
  }

  async countOwnedVideos(userId: string): Promise<number> {
    const database = await this.getDatabase();
    const row = await database.prepare<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM videos
      WHERE owner_id = ?
    `).get(userId);

    return row?.count ?? 0;
  }
}
