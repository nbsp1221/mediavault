import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import {
  type CreateInitializedPrimarySqliteDatabase,
  createInitializedPrimarySqliteDatabase,
} from '~/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import type { CreateUserInput, UserRepository } from '../../application/ports/user-repository.port';
import type { User } from '../../domain/entities/user.entity';

interface SqliteUserRepositoryOptions {
  createDatabase?: CreateInitializedPrimarySqliteDatabase;
  dbPath: string;
}

interface UserRow {
  created_at: string;
  id: string;
  password_hash: string;
  username: string;
  username_key: string;
}

function mapUserRow(row: UserRow): User {
  return {
    createdAt: new Date(row.created_at),
    id: row.id,
    passwordHash: row.password_hash,
    username: row.username,
    usernameKey: row.username_key,
  };
}

export class SqliteUserRepository implements UserRepository {
  private readonly createDatabase: CreateInitializedPrimarySqliteDatabase;
  private readonly dbPath: string;
  private databasePromise: Promise<SqliteDatabaseAdapter> | null = null;

  constructor(options: SqliteUserRepositoryOptions) {
    mkdirSync(dirname(options.dbPath), { recursive: true });
    this.createDatabase = options.createDatabase ?? createInitializedPrimarySqliteDatabase;
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

  async count(): Promise<number> {
    const database = await this.getDatabase();
    const row = await database
      .prepare<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM auth_users
    `)
      .get();

    return row?.count ?? 0;
  }

  async create(
    input: CreateUserInput,
    options: { requireFirstUser?: boolean } = {},
  ): Promise<User | null> {
    const database = await this.getDatabase();
    const created = await database.transaction(async (transaction) => {
      const userCount = await transaction
        .prepare<{ count: number }>(`
        SELECT COUNT(*) AS count
        FROM auth_users
      `)
        .get();
      const isFirstUser = (userCount?.count ?? 0) === 0;

      if (options.requireFirstUser && !isFirstUser) {
        return false;
      }

      await transaction
        .prepare(`
        INSERT INTO auth_users (
          id,
          username,
          username_key,
          password_hash,
          created_at
        ) VALUES (?, ?, ?, ?, ?)
      `)
        .run(
          input.id,
          input.username,
          input.usernameKey,
          input.passwordHash,
          input.createdAt.toISOString(),
        );
      return true;
    });

    if (!created) {
      return null;
    }

    const createdUser = await this.findById(input.id);
    if (!createdUser) {
      throw new Error(`Failed to create user ${input.id}`);
    }

    return createdUser;
  }

  async deleteByUsernameKey(usernameKey: string): Promise<boolean> {
    const database = await this.getDatabase();
    return database.transaction(async (transaction) => {
      const user = await transaction
        .prepare<{ id: string }>('SELECT id FROM auth_users WHERE username_key = ?')
        .get(usernameKey);
      if (!user) {
        return false;
      }
      await transaction
        .prepare(`DELETE FROM ingest_uploads WHERE owner_id = ? AND status = 'committed'`)
        .run(user.id);
      await transaction.prepare('DELETE FROM playlists WHERE owner_id = ?').run(user.id);
      const result = await transaction.prepare('DELETE FROM auth_users WHERE id = ?').run(user.id);
      return result.changes > 0;
    });
  }

  async findById(id: string): Promise<User | null> {
    const database = await this.getDatabase();
    const row = await database
      .prepare<UserRow>(`
      SELECT
        id,
        username,
        username_key,
        password_hash,
        created_at
      FROM auth_users
      WHERE id = ?
    `)
      .get(id);

    return row ? mapUserRow(row) : null;
  }

  async findByUsernameKey(usernameKey: string): Promise<User | null> {
    const database = await this.getDatabase();
    const row = await database
      .prepare<UserRow>(`
      SELECT
        id,
        username,
        username_key,
        password_hash,
        created_at
      FROM auth_users
      WHERE username_key = ?
    `)
      .get(usernameKey);

    return row ? mapUserRow(row) : null;
  }
}
