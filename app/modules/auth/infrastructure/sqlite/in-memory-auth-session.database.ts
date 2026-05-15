import type { SqliteDatabaseAdapter } from './sqlite-database.adapter';

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

function createUnsupportedStatement(sql: string) {
  return {
    get: () => {
      throw new Error(`Unsupported SQL in in-memory auth session adapter: ${sql}`);
    },
    run: () => {
      throw new Error(`Unsupported SQL in in-memory auth session adapter: ${sql}`);
    },
  };
}

export function createInMemoryAuthSessionDatabase(): SqliteDatabaseAdapter {
  const rows = new Map<string, AuthSessionRow>();

  return {
    exec(_sql) {
      // The in-memory fallback does not need schema setup.
    },
    prepare<Row = unknown>(sql: string) {
      if (sql.includes('SELECT') && sql.includes('FROM auth_sessions')) {
        return {
          get: (...params: unknown[]) => rows.get(String(params[0])) as Row | undefined,
          run: () => {
            throw new Error('run() is not supported for SELECT statements');
          },
        };
      }

      if (sql.includes('INSERT OR REPLACE INTO auth_sessions')) {
        return {
          get: () => {
            throw new Error('get() is not supported for INSERT statements');
          },
          run: (...params: unknown[]) => {
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

            rows.set(id, {
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
          get: () => {
            throw new Error('get() is not supported for UPDATE statements');
          },
          run: (...params: unknown[]) => {
            const [id] = params as [string];
            const row = rows.get(id);

            if (row) {
              rows.set(id, {
                ...row,
                is_revoked: 1,
              });
            }

            return { changes: row ? 1 : 0 };
          },
        };
      }

      if (sql.includes('expires_at = ?') && sql.includes('last_accessed_at = ?')) {
        return {
          get: () => {
            throw new Error('get() is not supported for UPDATE statements');
          },
          run: (...params: unknown[]) => {
            const [expiresAt, lastAccessedAt, id] = params as [string, string, string];
            const row = rows.get(id);

            if (row) {
              rows.set(id, {
                ...row,
                expires_at: expiresAt,
                last_accessed_at: lastAccessedAt,
              });
            }

            return { changes: row ? 1 : 0 };
          },
        };
      }

      return createUnsupportedStatement(sql);
    },
  };
}
