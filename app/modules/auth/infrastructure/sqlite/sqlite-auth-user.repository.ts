import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { type CreateMigratedPrimarySqliteDatabase, createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import type {
  AuthUserRepository,
  CreateAuthUserInput,
} from '../../application/ports/auth-user-repository.port';
import type { AuthUser } from '../../domain/auth-user';

interface SqliteAuthUserRepositoryOptions {
  createDatabase?: CreateMigratedPrimarySqliteDatabase;
  dbPath: string;
}

interface AuthUserRow {
  created_at: string;
  id: string;
  password_hash: string;
  role: 'admin' | 'user';
  username: string;
  username_key: string;
}

function mapAuthUserRow(row: AuthUserRow): AuthUser {
  return {
    createdAt: new Date(row.created_at),
    id: row.id,
    passwordHash: row.password_hash,
    role: row.role,
    username: row.username,
    usernameKey: row.username_key,
  };
}

export class SqliteAuthUserRepository implements AuthUserRepository {
  private readonly createDatabase: CreateMigratedPrimarySqliteDatabase;
  private readonly dbPath: string;
  private databasePromise: Promise<SqliteDatabaseAdapter> | null = null;

  constructor(options: SqliteAuthUserRepositoryOptions) {
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

  async create(input: CreateAuthUserInput): Promise<AuthUser> {
    const database = await this.getDatabase();

    await database.prepare(`
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

    const created = await this.findById(input.id);
    if (!created) {
      throw new Error(`Failed to create auth user ${input.id}`);
    }

    return created;
  }

  async deleteByUsernameKey(usernameKey: string): Promise<boolean> {
    const database = await this.getDatabase();
    const result = await database.prepare(`
      DELETE FROM auth_users
      WHERE username_key = ?
    `).run(usernameKey);

    return result.changes > 0;
  }

  async findById(id: string): Promise<AuthUser | null> {
    const database = await this.getDatabase();
    const row = await database.prepare<AuthUserRow>(`
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

    return row ? mapAuthUserRow(row) : null;
  }

  async findByUsernameKey(usernameKey: string): Promise<AuthUser | null> {
    const database = await this.getDatabase();
    const row = await database.prepare<AuthUserRow>(`
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

    return row ? mapAuthUserRow(row) : null;
  }
}
