import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { SessionPolicy } from '../../../app/modules/auth/domain/policies/SessionPolicy';
import { SqliteAuthUserRepository } from '../../../app/modules/auth/infrastructure/sqlite/sqlite-auth-user.repository';
import { SqliteSessionRepository } from '../../../app/modules/auth/infrastructure/sqlite/sqlite-session.repository';
import { createMigratedPrimarySqliteDatabase } from '../../../app/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { addAuthUser } from '../../../scripts/auth-add-user';
import { deleteAuthUser } from '../../../scripts/auth-delete-user';

describe('auth user CLI operations', () => {
  let dbPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mediavault-auth-user-cli-'));
    dbPath = join(tempDir, 'storage', 'db.sqlite');
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test('adds an auth user with a hashed password', async () => {
    const result = await addAuthUser({
      confirmPassword: 'correct-password',
      dbPath,
      now: new Date('2026-05-16T00:00:00.000Z'),
      password: 'correct-password',
      userId: 'user-1',
      username: 'Owner',
    });

    expect(result).toEqual({
      ok: true,
      userId: 'user-1',
      username: 'Owner',
    });

    const repository = new SqliteAuthUserRepository({ dbPath });
    const user = await repository.findByUsernameKey('owner');
    expect(user).toEqual(expect.objectContaining({
      id: 'user-1',
      role: 'admin',
      username: 'Owner',
      usernameKey: 'owner',
    }));
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  test('rejects duplicate usernames', async () => {
    await addAuthUser({
      confirmPassword: 'correct-password',
      dbPath,
      password: 'correct-password',
      userId: 'user-1',
      username: 'Owner',
    });

    await expect(addAuthUser({
      confirmPassword: 'another-password',
      dbPath,
      password: 'another-password',
      userId: 'user-2',
      username: ' owner ',
    })).resolves.toEqual({
      ok: false,
      reason: 'USERNAME_ALREADY_EXISTS',
    });
  });

  test('assigns existing single-user playlists to the first CLI-created account', async () => {
    const database = await createMigratedPrimarySqliteDatabase({ dbPath });
    await database.prepare(`
      INSERT INTO playlists (
        id,
        owner_id,
        name,
        name_key,
        type,
        is_public,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'playlist-1',
      'site-owner',
      'Watch Later',
      'watch later',
      'manual',
      0,
      '2026-05-15T00:00:00.000Z',
      '2026-05-15T00:00:00.000Z',
    );

    await expect(addAuthUser({
      confirmPassword: 'correct-password',
      dbPath,
      password: 'correct-password',
      userId: 'user-1',
      username: 'Owner',
    })).resolves.toEqual({
      ok: true,
      userId: 'user-1',
      username: 'Owner',
    });

    await expect(database.prepare<{ owner_id: string }>(`
      SELECT owner_id
      FROM playlists
      WHERE id = ?
    `).get('playlist-1')).resolves.toEqual({
      owner_id: 'user-1',
    });
  });

  test('rejects mismatched confirmation and invalid password length', async () => {
    await expect(addAuthUser({
      confirmPassword: 'different-password',
      dbPath,
      password: 'correct-password',
      userId: 'user-1',
      username: 'Owner',
    })).resolves.toEqual({
      ok: false,
      reason: 'PASSWORD_CONFIRMATION_MISMATCH',
    });

    await expect(addAuthUser({
      confirmPassword: 'abc',
      dbPath,
      password: 'abc',
      userId: 'user-1',
      username: 'Owner',
    })).resolves.toEqual({
      ok: false,
      reason: 'INVALID_PASSWORD',
    });
  });

  test('deletes an auth user and cascades their sessions', async () => {
    await addAuthUser({
      confirmPassword: 'correct-password',
      dbPath,
      password: 'correct-password',
      userId: 'user-1',
      username: 'Owner',
    });
    const sessionRepository = new SqliteSessionRepository({ dbPath });
    await sessionRepository.save(SessionPolicy.create({
      id: 'session-1',
      now: new Date('2026-05-16T00:00:00.000Z'),
      ttlMs: 60_000,
      userId: 'user-1',
    }));

    await expect(deleteAuthUser({
      dbPath,
      username: 'owner',
    })).resolves.toEqual({
      ok: true,
      username: 'Owner',
    });

    const repository = new SqliteAuthUserRepository({ dbPath });
    await expect(repository.findByUsernameKey('owner')).resolves.toBeNull();
    await expect(sessionRepository.findById('session-1')).resolves.toBeNull();
  });

  test('fails when deleting a missing username', async () => {
    await expect(deleteAuthUser({
      dbPath,
      username: 'missing',
    })).resolves.toEqual({
      ok: false,
      reason: 'USER_NOT_FOUND',
    });
  });
});
