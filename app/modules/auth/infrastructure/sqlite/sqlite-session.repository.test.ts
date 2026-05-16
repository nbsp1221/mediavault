import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SqliteRunResult, SqliteStatement } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { SessionPolicy } from '../../domain/policies/SessionPolicy';
import { SqliteSessionRepository } from './sqlite-session.repository';

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

class InMemorySqliteDatabase {
  private readonly rows = new Map<string, AuthSessionRow>();

  async exec(_sql: string) {}

  prepare<T>(sql: string): SqliteStatement<T> {
    if (sql.includes('SELECT') && sql.includes('FROM auth_sessions')) {
      return {
        all: async (...params: unknown[]) => {
          const row = this.rows.get(String(params[0])) as T | undefined;
          return row ? [row] : [];
        },
        get: async (...params: unknown[]) => this.rows.get(String(params[0])) as T | undefined,
        run: async (): Promise<SqliteRunResult> => {
          throw new Error('run() is not supported for SELECT statements in this test adapter');
        },
      };
    }

    if (sql.includes('INSERT OR REPLACE INTO auth_sessions')) {
      return {
        all: async () => {
          throw new Error('all() is not supported for INSERT statements in this test adapter');
        },
        get: async () => {
          throw new Error('get() is not supported for INSERT statements in this test adapter');
        },
        run: async (...params: unknown[]) => {
          const [
            id,
            userId,
            createdAt,
            expiresAt,
            ipAddress,
            isRevoked,
            lastAccessedAt,
            userAgent,
          ] = params as [string, string, string, string, string | null, number, string, string | null];
          this.rows.set(id, {
            created_at: createdAt,
            expires_at: expiresAt,
            id,
            ip_address: ipAddress,
            is_revoked: isRevoked,
            last_accessed_at: lastAccessedAt,
            user_id: userId,
            user_agent: userAgent,
          });
          return { changes: 1 };
        },
      };
    }

    if (sql.includes('SET is_revoked = 1')) {
      return {
        all: async () => {
          throw new Error('all() is not supported for UPDATE statements in this test adapter');
        },
        get: async () => {
          throw new Error('get() is not supported for UPDATE statements in this test adapter');
        },
        run: async (...params: unknown[]) => {
          const [lookup] = params as [string];

          if (sql.includes('WHERE user_id = ?')) {
            let changes = 0;

            for (const [id, row] of this.rows) {
              if (row.user_id === lookup) {
                this.rows.set(id, {
                  ...row,
                  is_revoked: 1,
                });
                changes += 1;
              }
            }

            return { changes };
          }

          const row = this.rows.get(lookup);
          if (row) {
            this.rows.set(lookup, {
              ...row,
              is_revoked: 1,
            });
          }

          return { changes: row ? 1 : 0 };
        },
      };
    }

    if (sql.includes('SET') && sql.includes('expires_at = ?') && sql.includes('last_accessed_at = ?')) {
      return {
        all: async () => {
          throw new Error('all() is not supported for UPDATE statements in this test adapter');
        },
        get: async () => {
          throw new Error('get() is not supported for UPDATE statements in this test adapter');
        },
        run: async (...params: unknown[]) => {
          const [expiresAt, lastAccessedAt, id] = params as [string, string, string];
          const row = this.rows.get(id);
          if (row) {
            this.rows.set(id, {
              ...row,
              expires_at: expiresAt,
              last_accessed_at: lastAccessedAt,
            });
          }

          return { changes: row ? 1 : 0 };
        },
      };
    }

    throw new Error(`Unsupported SQL in test adapter: ${sql}`);
  }

  async transaction<T>(callback: (database: InMemorySqliteDatabase) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

describe('SqliteSessionRepository', () => {
  let dbPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'local-streamer-auth-'));
    dbPath = join(tempDir, 'db.sqlite');
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test('creates and finds an active session', async () => {
    const repository = new SqliteSessionRepository({
      createDatabase: async () => new InMemorySqliteDatabase(),
      dbPath,
    });
    const session = SessionPolicy.create({
      id: 'session-1',
      now: new Date('2026-03-07T00:00:00.000Z'),
      ttlMs: 60_000,
      userId: 'user-1',
      userAgent: 'vitest',
    });

    await repository.save(session);

    const found = await repository.findById('session-1');

    expect(found).toEqual(session);
  });

  test('returns null for an unknown session', async () => {
    const repository = new SqliteSessionRepository({
      createDatabase: async () => new InMemorySqliteDatabase(),
      dbPath,
    });

    await expect(repository.findById('missing')).resolves.toBeNull();
  });

  test('revokes a session', async () => {
    const repository = new SqliteSessionRepository({
      createDatabase: async () => new InMemorySqliteDatabase(),
      dbPath,
    });
    const session = SessionPolicy.create({
      id: 'session-2',
      now: new Date('2026-03-07T00:00:00.000Z'),
      ttlMs: 60_000,
      userId: 'user-1',
    });

    await repository.save(session);
    await repository.revoke('session-2');

    const found = await repository.findById('session-2');

    expect(found).toEqual({
      ...session,
      isRevoked: true,
    });
  });

  test('revokes all sessions for a user', async () => {
    const repository = new SqliteSessionRepository({
      createDatabase: async () => new InMemorySqliteDatabase(),
      dbPath,
    });
    const firstSession = SessionPolicy.create({
      id: 'session-1',
      now: new Date('2026-03-07T00:00:00.000Z'),
      ttlMs: 60_000,
      userId: 'user-1',
    });
    const secondSession = SessionPolicy.create({
      id: 'session-2',
      now: new Date('2026-03-07T00:00:00.000Z'),
      ttlMs: 60_000,
      userId: 'user-1',
    });
    const otherSession = SessionPolicy.create({
      id: 'session-3',
      now: new Date('2026-03-07T00:00:00.000Z'),
      ttlMs: 60_000,
      userId: 'user-2',
    });

    await repository.save(firstSession);
    await repository.save(secondSession);
    await repository.save(otherSession);
    await repository.revokeByUserId('user-1');

    await expect(repository.findById('session-1')).resolves.toEqual({
      ...firstSession,
      isRevoked: true,
    });
    await expect(repository.findById('session-2')).resolves.toEqual({
      ...secondSession,
      isRevoked: true,
    });
    await expect(repository.findById('session-3')).resolves.toEqual(otherSession);
  });

  test('touch updates last accessed and expiry', async () => {
    const repository = new SqliteSessionRepository({
      createDatabase: async () => new InMemorySqliteDatabase(),
      dbPath,
    });
    const session = SessionPolicy.create({
      id: 'session-3',
      now: new Date('2026-03-07T00:00:00.000Z'),
      ttlMs: 60_000,
      userId: 'user-1',
    });

    await repository.save(session);
    await repository.touch({
      expiresAt: new Date('2026-03-07T00:02:00.000Z'),
      id: 'session-3',
      lastAccessedAt: new Date('2026-03-07T00:01:00.000Z'),
    });

    const found = await repository.findById('session-3');

    expect(found).toEqual({
      ...session,
      expiresAt: new Date('2026-03-07T00:02:00.000Z'),
      lastAccessedAt: new Date('2026-03-07T00:01:00.000Z'),
    });
  });

  test('creates the Bun database lazily on first repository use', async () => {
    const createDatabase = vi.fn(async () => new InMemorySqliteDatabase());
    const repository = new SqliteSessionRepository({
      createDatabase,
      dbPath,
    });

    expect(createDatabase).not.toHaveBeenCalled();

    await repository.findById('missing');

    expect(createDatabase).toHaveBeenCalledTimes(1);
  });
});
