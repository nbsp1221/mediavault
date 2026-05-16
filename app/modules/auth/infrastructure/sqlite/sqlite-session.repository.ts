import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { type CreateMigratedPrimarySqliteDatabase, createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import type { AuthSessionRepository, TouchAuthSessionInput } from '../../application/ports/auth-session-repository.port';
import type { AuthSession } from '../../domain/auth-session';

interface SqliteSessionRepositoryOptions {
  createDatabase?: CreateMigratedPrimarySqliteDatabase;
  dbPath: string;
}

interface AuthSessionRow {
  created_at: string;
  expires_at: string;
  id: string;
  ip_address: string | null;
  is_revoked: number;
  last_accessed_at: string;
  user_id: string;
  user_agent: string | null;
}

export class SqliteSessionRepository implements AuthSessionRepository {
  private readonly createDatabase: CreateMigratedPrimarySqliteDatabase;
  private readonly dbPath: string;
  private databasePromise: Promise<SqliteDatabaseAdapter> | null = null;

  constructor(options: SqliteSessionRepositoryOptions) {
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

  async findById(id: string): Promise<AuthSession | null> {
    const database = await this.getDatabase();
    const row = await database
      .prepare(`
        SELECT
          id,
          created_at,
          expires_at,
          ip_address,
          is_revoked,
          last_accessed_at,
          user_id,
          user_agent
        FROM auth_sessions
        WHERE id = ?
      `)
      .get(id) as AuthSessionRow | undefined;

    if (!row) {
      return null;
    }

    return {
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      id: row.id,
      ipAddress: row.ip_address ?? undefined,
      isRevoked: row.is_revoked === 1,
      lastAccessedAt: new Date(row.last_accessed_at),
      userId: row.user_id,
      userAgent: row.user_agent ?? undefined,
    };
  }

  async revoke(id: string): Promise<void> {
    const database = await this.getDatabase();
    await database
      .prepare(`
        UPDATE auth_sessions
        SET is_revoked = 1
        WHERE id = ?
      `)
      .run(id);
  }

  async revokeByUserId(userId: string): Promise<void> {
    const database = await this.getDatabase();
    await database
      .prepare(`
        UPDATE auth_sessions
        SET is_revoked = 1
        WHERE user_id = ?
      `)
      .run(userId);
  }

  async save(session: AuthSession): Promise<void> {
    const database = await this.getDatabase();
    await database
      .prepare(`
        INSERT OR REPLACE INTO auth_sessions (
          id,
          user_id,
          created_at,
          expires_at,
          ip_address,
          is_revoked,
          last_accessed_at,
          user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        session.id,
        session.userId,
        session.createdAt.toISOString(),
        session.expiresAt.toISOString(),
        session.ipAddress ?? null,
        session.isRevoked ? 1 : 0,
        session.lastAccessedAt.toISOString(),
        session.userAgent ?? null,
      );
  }

  async touch(input: TouchAuthSessionInput): Promise<void> {
    const database = await this.getDatabase();
    await database
      .prepare(`
        UPDATE auth_sessions
        SET
          expires_at = ?,
          last_accessed_at = ?
        WHERE id = ?
      `)
      .run(
        input.expiresAt.toISOString(),
        input.lastAccessedAt.toISOString(),
        input.id,
      );
  }
}
