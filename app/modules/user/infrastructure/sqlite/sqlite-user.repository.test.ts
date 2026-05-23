import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { SqliteUserRepository } from './sqlite-user.repository';

describe('SqliteUserRepository', () => {
  let dbPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mediavault-users-'));
    dbPath = join(tempDir, 'storage', 'db.sqlite');
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test('creates and finds a user by username key and id', async () => {
    const repository = new SqliteUserRepository({ dbPath });
    const createdAt = new Date('2026-05-16T00:00:00.000Z');

    const user = await repository.create({
      createdAt,
      id: 'user-1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      role: 'admin',
      username: 'Owner',
      usernameKey: 'owner',
    });

    expect(user).toEqual({
      createdAt,
      id: 'user-1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      role: 'admin',
      username: 'Owner',
      usernameKey: 'owner',
    });
    await expect(repository.findByUsernameKey('owner')).resolves.toEqual(user);
    await expect(repository.findById('user-1')).resolves.toEqual(user);
  });

  test('rejects duplicate username keys', async () => {
    const repository = new SqliteUserRepository({ dbPath });
    const createdAt = new Date('2026-05-16T00:00:00.000Z');

    await repository.create({
      createdAt,
      id: 'user-1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      role: 'admin',
      username: 'Owner',
      usernameKey: 'owner',
    });

    await expect(repository.create({
      createdAt,
      id: 'user-2',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      role: 'admin',
      username: 'OWNER',
      usernameKey: 'owner',
    })).rejects.toThrow();
  });

  test('returns null for first-user-only creation after a user already exists', async () => {
    const repository = new SqliteUserRepository({ dbPath });
    const createdAt = new Date('2026-05-16T00:00:00.000Z');

    await repository.create({
      createdAt,
      id: 'user-1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      role: 'admin',
      username: 'Owner',
      usernameKey: 'owner',
    });

    await expect(repository.create({
      createdAt,
      id: 'user-2',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      role: 'admin',
      username: 'Second',
      usernameKey: 'second',
    }, {
      requireFirstUser: true,
    })).resolves.toBeNull();

    await expect(repository.count()).resolves.toBe(1);
  });

  test('deletes users by username key', async () => {
    const repository = new SqliteUserRepository({ dbPath });
    const createdAt = new Date('2026-05-16T00:00:00.000Z');

    await repository.create({
      createdAt,
      id: 'user-1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      role: 'admin',
      username: 'Owner',
      usernameKey: 'owner',
    });

    await expect(repository.deleteByUsernameKey('owner')).resolves.toBe(true);
    await expect(repository.findByUsernameKey('owner')).resolves.toBeNull();
    await expect(repository.deleteByUsernameKey('owner')).resolves.toBe(false);
  });

  test('counts users', async () => {
    const repository = new SqliteUserRepository({ dbPath });
    const createdAt = new Date('2026-05-16T00:00:00.000Z');

    await expect(repository.count()).resolves.toBe(0);
    await repository.create({
      createdAt,
      id: 'user-1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      role: 'admin',
      username: 'Owner',
      usernameKey: 'owner',
    });
    await expect(repository.count()).resolves.toBe(1);
  });

  test('assigns existing single-user playlists to the first user', async () => {
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

    const repository = new SqliteUserRepository({ dbPath });
    await repository.create({
      createdAt: new Date('2026-05-16T00:00:00.000Z'),
      id: 'user-1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      role: 'admin',
      username: 'Owner',
      usernameKey: 'owner',
    });

    await expect(database.prepare<{ owner_id: string }>(`
      SELECT owner_id
      FROM playlists
      WHERE id = ?
    `).get('playlist-1')).resolves.toEqual({
      owner_id: 'user-1',
    });
  });
});
