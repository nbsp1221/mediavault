import { describe, expect, test } from 'vitest';
import { createSqliteDatabaseForRuntime } from './bun-sqlite.database';

function createModuleUnavailableError(message: string, code: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

describe('createSqliteDatabaseForRuntime', () => {
  test('falls back to an in-memory adapter when Bun and Node SQLite are unavailable', async () => {
    const database = await createSqliteDatabaseForRuntime({
      dbPath: '/tmp/local-streamer-db.sqlite',
      loadBunDatabase: async () => {
        throw createModuleUnavailableError(
          'Cannot load bun:sqlite in this runtime',
          'ERR_UNSUPPORTED_ESM_URL_SCHEME',
        );
      },
      loadNodeDatabase: async () => {
        throw createModuleUnavailableError(
          'No such built-in module: node:sqlite',
          'ERR_UNKNOWN_BUILTIN_MODULE',
        );
      },
    });

    database
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
        'session-1',
        'user-1',
        '2026-03-10T00:00:00.000Z',
        '2026-03-10T01:00:00.000Z',
        '127.0.0.1',
        0,
        '2026-03-10T00:00:00.000Z',
        'Vitest',
      );

    expect(
      database
        .prepare(`
          SELECT
            id,
            user_id,
            created_at,
            expires_at,
            ip_address,
            is_revoked,
            last_accessed_at,
            user_agent
          FROM auth_sessions
          WHERE id = ?
        `)
        .get('session-1'),
    ).toEqual({
      created_at: '2026-03-10T00:00:00.000Z',
      expires_at: '2026-03-10T01:00:00.000Z',
      id: 'session-1',
      ip_address: '127.0.0.1',
      is_revoked: 0,
      last_accessed_at: '2026-03-10T00:00:00.000Z',
      user_agent: 'Vitest',
      user_id: 'user-1',
    });
  });
});
