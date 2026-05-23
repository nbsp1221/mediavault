import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { UserCredential, UserCredentialReader } from '~/modules/auth/application/ports/user-credential-reader.port';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { type CreateMigratedPrimarySqliteDatabase, createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';

interface SqliteUserCredentialReaderAdapterOptions {
  createDatabase?: CreateMigratedPrimarySqliteDatabase;
  dbPath: string;
}

interface UserCredentialRow {
  id: string;
  password_hash: string;
  username_key: string;
}

export class SqliteUserCredentialReaderAdapter implements UserCredentialReader {
  private readonly createDatabase: CreateMigratedPrimarySqliteDatabase;
  private readonly dbPath: string;
  private databasePromise: Promise<SqliteDatabaseAdapter> | null = null;

  constructor(options: SqliteUserCredentialReaderAdapterOptions) {
    mkdirSync(dirname(options.dbPath), { recursive: true });
    this.createDatabase = options.createDatabase ?? createMigratedPrimarySqliteDatabase;
    this.dbPath = options.dbPath;
  }

  private async getDatabase(): Promise<SqliteDatabaseAdapter> {
    if (!this.databasePromise) {
      this.databasePromise = this.createDatabase({
        dbPath: this.dbPath,
      });
    }

    return this.databasePromise;
  }

  async findCredentialByUsernameKey(usernameKey: string): Promise<UserCredential | null> {
    const database = await this.getDatabase();
    const row = await database.prepare<UserCredentialRow>(`
      SELECT
        id,
        username_key,
        password_hash
      FROM auth_users
      WHERE username_key = ?
    `).get(usernameKey);

    return row
      ? {
          id: row.id,
          passwordHash: row.password_hash,
          usernameKey: row.username_key,
        }
      : null;
  }
}
