import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { afterEach, describe, expect, test } from 'vitest';
import { createMigratedPrimarySqliteDatabase } from '../../../app/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { TEST_DATABASE_ENCRYPTION_KEY } from '../../support/database-encryption-key';

const workspaces: string[] = [];

const FIXTURE_TITLE = 'encrypted-title-search-sentinel';
const FIXTURE_TAG = 'encrypted-tag-search-sentinel';
const FIXTURE_USERNAME = 'encrypted-user-search-sentinel';

afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map(workspace => rm(workspace, { force: true, recursive: true })),
  );
});

function existingDatabaseFiles(dbPath: string): string[] {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].filter(existsSync);
}

function assertFileDoesNotContain(filePath: string, value: string): void {
  expect(readFileSync(filePath).includes(Buffer.from(value))).toBe(false);
}

describe('primary SQLite encryption at rest', () => {
  test('keeps metadata searchable through SQL but not through raw database file search', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'mediavault-encrypted-sqlite-'));
    workspaces.push(workspace);
    const dbPath = path.join(workspace, 'storage', 'db.sqlite');
    const database = await createMigratedPrimarySqliteDatabase({
      dbPath,
      encryptionKey: TEST_DATABASE_ENCRYPTION_KEY,
    });
    await database.prepare(`
      INSERT INTO auth_users (id, username, username_key, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'encrypted-owner-id',
      'Encrypted Owner',
      'encrypted-owner',
      'test-password-hash',
      'user',
      '2026-05-17T00:00:00.000Z',
    );

    await database.prepare(`
      INSERT INTO videos (
        id,
        title,
        description,
        duration_seconds,
        content_type_slug,
        owner_id,
        visibility,
        created_at,
        updated_at,
        sort_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'encrypted-video-id',
      FIXTURE_TITLE,
      null,
      1,
      'clip',
      'encrypted-owner-id',
      'private',
      '2026-05-17T00:00:00.000Z',
      '2026-05-17T00:00:00.000Z',
      1,
    );
    await database.prepare('INSERT INTO tags (slug, label, created_at) VALUES (?, ?, ?)').run(
      FIXTURE_TAG,
      FIXTURE_TAG,
      '2026-05-17T00:00:00.000Z',
    );
    await database.prepare('INSERT INTO video_tags (video_id, tag_slug) VALUES (?, ?)').run(
      'encrypted-video-id',
      FIXTURE_TAG,
    );
    await database.prepare(`
      INSERT INTO auth_users (
        id,
        username,
        username_key,
        password_hash,
        role,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'encrypted-user-id',
      FIXTURE_USERNAME,
      FIXTURE_USERNAME,
      'hash',
      'admin',
      '2026-05-17T00:00:00.000Z',
    );

    await expect(database.prepare<{ title: string }>('SELECT title FROM videos WHERE title = ?').get(FIXTURE_TITLE))
      .resolves.toEqual({ title: FIXTURE_TITLE });
    await expect(database.prepare<{ slug: string }>('SELECT slug FROM tags WHERE slug = ?').get(FIXTURE_TAG))
      .resolves.toEqual({ slug: FIXTURE_TAG });
    await expect(database.prepare<{ username: string }>('SELECT username FROM auth_users WHERE username = ?').get(FIXTURE_USERNAME))
      .resolves.toEqual({ username: FIXTURE_USERNAME });

    const searchedFiles = existingDatabaseFiles(dbPath);
    expect(searchedFiles).toEqual(expect.arrayContaining([
      dbPath,
      `${dbPath}-shm`,
      `${dbPath}-wal`,
    ]));
    for (const filePath of searchedFiles) {
      assertFileDoesNotContain(filePath, FIXTURE_TITLE);
      assertFileDoesNotContain(filePath, FIXTURE_TAG);
      assertFileDoesNotContain(filePath, FIXTURE_USERNAME);
    }

    const keylessClient = createClient({ url: `file:${dbPath}` });
    await expect(keylessClient.execute('SELECT title FROM videos')).rejects.toThrow();
  });

  test('fails closed for wrong-key and plaintext database opens', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'mediavault-encrypted-sqlite-'));
    workspaces.push(workspace);
    const encryptedPath = path.join(workspace, 'encrypted.sqlite');
    await createMigratedPrimarySqliteDatabase({
      dbPath: encryptedPath,
      encryptionKey: TEST_DATABASE_ENCRYPTION_KEY,
    });

    await expect(createMigratedPrimarySqliteDatabase({
      dbPath: encryptedPath,
      encryptionKey: 'wrong-key',
    })).rejects.toThrow();

    const plaintextPath = path.join(workspace, 'plain.sqlite');
    const plaintextClient = createClient({ url: `file:${plaintextPath}` });
    await plaintextClient.execute('CREATE TABLE plain_probe (id TEXT PRIMARY KEY)');

    await expect(createMigratedPrimarySqliteDatabase({
      dbPath: plaintextPath,
      encryptionKey: TEST_DATABASE_ENCRYPTION_KEY,
    })).rejects.toThrow();
  });
});
