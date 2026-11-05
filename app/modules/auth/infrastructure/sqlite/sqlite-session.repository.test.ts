import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Mock, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  type CreateInitializedPrimarySqliteDatabase,
  createInitializedPrimarySqliteDatabase,
} from '~/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import { SessionPolicy } from '../../domain/policies/SessionPolicy';
import { SqliteSessionRepository } from './sqlite-session.repository';

describe('SqliteSessionRepository', () => {
  let dbPath: string;
  let tempDir: string;
  let database: Awaited<ReturnType<typeof createInitializedPrimarySqliteDatabase>>;
  let createDatabase: Mock<CreateInitializedPrimarySqliteDatabase>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mediavault-auth-sessions-'));
    dbPath = join(tempDir, 'db.sqlite');
    database = await createInitializedPrimarySqliteDatabase({ dbPath });
    for (const id of ['user-1', 'user-2']) {
      await database
        .prepare(
          `INSERT INTO auth_users (id, username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(id, id, id, 'test-password-hash', '2026-03-07T00:00:00.000Z');
    }
    createDatabase = vi.fn<CreateInitializedPrimarySqliteDatabase>(async () => database);
  });

  afterEach(async () => {
    await database.close();
    await rm(tempDir, { force: true, recursive: true });
  });

  test('creates and finds an active session', async () => {
    const repository = new SqliteSessionRepository({ createDatabase, dbPath });
    const session = SessionPolicy.create({
      id: 'session-1',
      now: new Date('2026-03-07T00:00:00.000Z'),
      ttlMs: 60_000,
      userId: 'user-1',
      userAgent: 'vitest',
    });
    await repository.save(session);
    await expect(repository.findById('session-1')).resolves.toEqual(session);
  });

  test('returns null for an unknown session', async () => {
    const repository = new SqliteSessionRepository({ createDatabase, dbPath });
    await expect(repository.findById('missing')).resolves.toBeNull();
  });

  test('revokes a session', async () => {
    const repository = new SqliteSessionRepository({ createDatabase, dbPath });
    const session = SessionPolicy.create({
      id: 'session-2',
      now: new Date('2026-03-07T00:00:00.000Z'),
      ttlMs: 60_000,
      userId: 'user-1',
    });
    await repository.save(session);
    await repository.revoke('session-2');
    await expect(repository.findById('session-2')).resolves.toEqual({
      ...session,
      isRevoked: true,
    });
  });

  test('revokes all sessions for a user without revoking another account', async () => {
    const repository = new SqliteSessionRepository({ createDatabase, dbPath });
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
    const repository = new SqliteSessionRepository({ createDatabase, dbPath });
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
    await expect(repository.findById('session-3')).resolves.toEqual({
      ...session,
      expiresAt: new Date('2026-03-07T00:02:00.000Z'),
      lastAccessedAt: new Date('2026-03-07T00:01:00.000Z'),
    });
  });

  test('opens its database dependency lazily on first repository use', async () => {
    const repository = new SqliteSessionRepository({ createDatabase, dbPath });
    expect(createDatabase).not.toHaveBeenCalled();
    await repository.findById('missing');
    expect(createDatabase).toHaveBeenCalledTimes(1);
  });
});
