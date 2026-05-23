import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { type CreateMigratedPrimarySqliteDatabase, createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import type {
  CreateUserInput,
  UserRepository,
} from '../../application/ports/user-repository.port';
import type { User } from '../../domain/entities/user.entity';

interface SqliteUserRepositoryOptions {
  createDatabase?: CreateMigratedPrimarySqliteDatabase;
  dbPath: string;
}

interface UserRow {
  created_at: string;
  id: string;
  password_hash: string;
  role: 'admin' | 'user';
  username: string;
  username_key: string;
}

function mapUserRow(row: UserRow): User {
  return {
    createdAt: new Date(row.created_at),
    id: row.id,
    passwordHash: row.password_hash,
    role: row.role,
    username: row.username,
    usernameKey: row.username_key,
  };
}

export class SqliteUserRepository implements UserRepository {
  private readonly createDatabase: CreateMigratedPrimarySqliteDatabase;
  private readonly dbPath: string;
  private databasePromise: Promise<SqliteDatabaseAdapter> | null = null;

  constructor(options: SqliteUserRepositoryOptions) {
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

  async count(): Promise<number> {
    const database = await this.getDatabase();
    const row = await database.prepare<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM auth_users
    `).get();

    return row?.count ?? 0;
  }

  async create(
    input: CreateUserInput,
    options: { requireFirstUser?: boolean } = {},
  ): Promise<User | null> {
    const database = await this.getDatabase();
    let created = false;

    await database.transaction(async (transaction) => {
      const userCount = await transaction.prepare<{ count: number }>(`
        SELECT COUNT(*) AS count
        FROM auth_users
      `).get();
      const isFirstUser = (userCount?.count ?? 0) === 0;

      if (options.requireFirstUser && !isFirstUser) {
        return;
      }

      await transaction.prepare(`
        INSERT INTO auth_users (
          id,
          username,
          username_key,
          password_hash,
          role,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        input.id,
        input.username,
        input.usernameKey,
        input.passwordHash,
        input.role,
        input.createdAt.toISOString(),
      );
      created = true;

      if (isFirstUser) {
        await transaction.prepare(`
          UPDATE playlists
          SET owner_id = ?
        `).run(input.id);
      }
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
    const result = await database.prepare(`
      DELETE FROM auth_users
      WHERE username_key = ?
    `).run(usernameKey);

    return result.changes > 0;
  }

  async findById(id: string): Promise<User | null> {
    const database = await this.getDatabase();
    const row = await database.prepare<UserRow>(`
      SELECT
        id,
        username,
        username_key,
        password_hash,
        role,
        created_at
      FROM auth_users
      WHERE id = ?
    `).get(id);

    return row ? mapUserRow(row) : null;
  }

  async findByUsernameKey(usernameKey: string): Promise<User | null> {
    const database = await this.getDatabase();
    const row = await database.prepare<UserRow>(`
      SELECT
        id,
        username,
        username_key,
        password_hash,
        role,
        created_at
      FROM auth_users
      WHERE username_key = ?
    `).get(usernameKey);

    return row ? mapUserRow(row) : null;
  }
}
