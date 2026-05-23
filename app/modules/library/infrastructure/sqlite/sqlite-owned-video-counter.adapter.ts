import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import type { OwnedVideoCounterPort } from '~/modules/user/application/ports/owned-video-counter.port';
import { getPrimaryStorageConfig } from '~/modules/storage/infrastructure/config/storage-config.server';
import { type CreateMigratedPrimarySqliteDatabase, createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';

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
    const canCountByOwnerId = await videosHaveOwnerColumn(database);

    if (!canCountByOwnerId) {
      return await countVideosConservatively(database);
    }

    const row = await database.prepare<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM videos
      WHERE owner_id = ?
    `).get(userId);

    return row?.count ?? 0;
  }
}

async function countVideosConservatively(database: SqliteDatabaseAdapter): Promise<number> {
  const row = await database.prepare<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM videos
  `).get();

  return row?.count ?? 0;
}

async function videosHaveOwnerColumn(database: SqliteDatabaseAdapter): Promise<boolean> {
  const rows = await database.prepare<{ name: string }>(`
    PRAGMA table_info(videos)
  `).all();

  return rows.some(row => row.name === 'owner_id');
}
