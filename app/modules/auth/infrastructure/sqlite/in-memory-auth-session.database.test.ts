import { describe, expect, test } from 'vitest';
import { createInMemoryAuthSessionDatabase } from './in-memory-auth-session.database';

describe('createInMemoryAuthSessionDatabase', () => {
  test('stores, finds, revokes, and touches auth session rows', () => {
    const database = createInMemoryAuthSessionDatabase();

    expect(() => database.exec('CREATE TABLE auth_sessions')).not.toThrow();
    expect(database.prepare('SELECT * FROM auth_sessions WHERE id = ?').get('session-1')).toBeUndefined();
    expect(() => database.prepare('SELECT * FROM auth_sessions WHERE id = ?').run()).toThrow(
      /not supported for SELECT statements/,
    );

    const insert = database.prepare(`
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
    `);

    expect(() => insert.get()).toThrow(/not supported for INSERT statements/);
    expect(insert.run(
      'session-1',
      'user-1',
      '2026-05-16T00:00:00.000Z',
      '2026-05-16T00:01:00.000Z',
      '127.0.0.1',
      0,
      '2026-05-16T00:00:00.000Z',
      'vitest',
    )).toEqual({ changes: 1 });

    expect(database.prepare('SELECT * FROM auth_sessions WHERE id = ?').get('session-1')).toEqual({
      created_at: '2026-05-16T00:00:00.000Z',
      expires_at: '2026-05-16T00:01:00.000Z',
      id: 'session-1',
      ip_address: '127.0.0.1',
      is_revoked: 0,
      last_accessed_at: '2026-05-16T00:00:00.000Z',
      user_agent: 'vitest',
      user_id: 'user-1',
    });

    const revoke = database.prepare('UPDATE auth_sessions SET is_revoked = 1 WHERE id = ?');
    expect(() => revoke.get()).toThrow(/not supported for UPDATE statements/);
    expect(revoke.run('missing')).toEqual({ changes: 0 });
    expect(revoke.run('session-1')).toEqual({ changes: 1 });
    expect(database.prepare<{ is_revoked: number }>('SELECT * FROM auth_sessions WHERE id = ?').get('session-1')?.is_revoked).toBe(1);

    const touch = database.prepare(`
      UPDATE auth_sessions
      SET expires_at = ?, last_accessed_at = ?
      WHERE id = ?
    `);
    expect(touch.run(
      '2026-05-16T00:03:00.000Z',
      '2026-05-16T00:02:00.000Z',
      'missing',
    )).toEqual({ changes: 0 });
    expect(touch.run(
      '2026-05-16T00:03:00.000Z',
      '2026-05-16T00:02:00.000Z',
      'session-1',
    )).toEqual({ changes: 1 });
    expect(database.prepare('SELECT * FROM auth_sessions WHERE id = ?').get('session-1')).toEqual(expect.objectContaining({
      expires_at: '2026-05-16T00:03:00.000Z',
      last_accessed_at: '2026-05-16T00:02:00.000Z',
    }));
  });

  test('rejects unsupported statements with the SQL in the error message', () => {
    const database = createInMemoryAuthSessionDatabase();
    const unsupported = database.prepare('DELETE FROM auth_sessions WHERE id = ?');

    expect(() => unsupported.get('session-1')).toThrow(/Unsupported SQL in in-memory auth session adapter/);
    expect(() => unsupported.run('session-1')).toThrow(/Unsupported SQL in in-memory auth session adapter/);
  });
});
