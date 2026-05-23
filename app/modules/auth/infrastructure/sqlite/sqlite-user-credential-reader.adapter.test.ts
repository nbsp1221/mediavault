import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { SqliteUserRepository } from '~/modules/user/infrastructure/sqlite/sqlite-user.repository';
import { SqliteUserCredentialReaderAdapter } from './sqlite-user-credential-reader.adapter';

describe('SqliteUserCredentialReaderAdapter', () => {
  let dbPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mediavault-user-credentials-'));
    dbPath = join(tempDir, 'storage', 'db.sqlite');
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test('reads login credentials from the persisted user table', async () => {
    const userRepository = new SqliteUserRepository({ dbPath });
    await userRepository.create({
      createdAt: new Date('2026-05-16T00:00:00.000Z'),
      id: 'user-1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      role: 'admin',
      username: 'Owner',
      usernameKey: 'owner',
    });

    const reader = new SqliteUserCredentialReaderAdapter({ dbPath });

    await expect(reader.findCredentialByUsernameKey('owner')).resolves.toEqual({
      id: 'user-1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
      usernameKey: 'owner',
    });
    await expect(reader.findCredentialByUsernameKey('missing')).resolves.toBeNull();
  });
});
