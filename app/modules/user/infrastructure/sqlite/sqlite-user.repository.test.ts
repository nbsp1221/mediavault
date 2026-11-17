import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
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
      username: 'Owner',
      usernameKey: 'owner',
    });

    expect(user).toEqual({
      createdAt,
      id: 'user-1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
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
      username: 'Owner',
      usernameKey: 'owner',
    });

    await expect(
      repository.create({
        createdAt,
        id: 'user-2',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
        username: 'OWNER',
        usernameKey: 'owner',
      }),
    ).rejects.toThrow();
  });

  test('returns null for first-user-only creation after a user already exists', async () => {
    const repository = new SqliteUserRepository({ dbPath });
    const createdAt = new Date('2026-05-16T00:00:00.000Z');

    await repository.create({
      createdAt,
      id: 'user-1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      username: 'Owner',
      usernameKey: 'owner',
    });

    await expect(
      repository.create(
        {
          createdAt,
          id: 'user-2',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
          username: 'Second',
          usernameKey: 'second',
        },
        {
          requireFirstUser: true,
        },
      ),
    ).resolves.toBeNull();

    await expect(repository.count()).resolves.toBe(1);
  });

  test('deletes users by username key', async () => {
    const repository = new SqliteUserRepository({ dbPath });
    const createdAt = new Date('2026-05-16T00:00:00.000Z');

    await repository.create({
      createdAt,
      id: 'user-1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
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
      username: 'Owner',
      usernameKey: 'owner',
    });
    await expect(repository.count()).resolves.toBe(1);
  });

  test('allows only one concurrent first-account bootstrap', async () => {
    const repository = new SqliteUserRepository({ dbPath });
    const createdAt = new Date('2026-05-16T00:00:00.000Z');
    const results = await Promise.all(
      ['first', 'second'].map((id) =>
        repository.create(
          {
            createdAt,
            id,
            passwordHash: '$argon2id$test-hash',
            username: id,
            usernameKey: id,
          },
          { requireFirstUser: true },
        ),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(repository.count()).resolves.toBe(1);
  });
});
