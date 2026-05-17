import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { afterEach, describe, expect, test } from 'vitest';
import { TEST_DATABASE_ENCRYPTION_KEY } from '../../../../../tests/support/database-encryption-key';
import { createPrimarySqliteDatabase } from './primary-sqlite.database';

interface EventRow {
  id: string;
  position: number;
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map(workspace => rm(workspace, { force: true, recursive: true })),
  );
});

describe('createPrimarySqliteDatabase', () => {
  test('serializes write transactions opened from separate adapters for one database file', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'local-streamer-primary-sqlite-'));
    workspaces.push(workspace);
    const dbPath = join(workspace, 'storage', 'db.sqlite');
    const firstDatabase = await createPrimarySqliteDatabase({
      dbPath,
      encryptionKey: TEST_DATABASE_ENCRYPTION_KEY,
    });
    const secondDatabase = await createPrimarySqliteDatabase({
      dbPath,
      encryptionKey: TEST_DATABASE_ENCRYPTION_KEY,
    });
    const firstStarted = deferred();
    const releaseFirst = deferred();
    let secondEntered = false;

    await firstDatabase.exec(`
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL
      ) STRICT
    `);

    const firstWrite = firstDatabase.transaction(async (database) => {
      await database.prepare(`
        INSERT INTO events (id, position)
        VALUES (?, ?)
      `).run('first', 1);
      firstStarted.resolve();
      await releaseFirst.promise;
    });

    await firstStarted.promise;

    const secondWrite = secondDatabase.transaction(async (database) => {
      secondEntered = true;
      await database.prepare(`
        INSERT INTO events (id, position)
        VALUES (?, ?)
      `).run('second', 2);
    });

    const racedBeforeRelease = await Promise.race([
      secondWrite.then(() => 'completed' as const),
      new Promise<'blocked'>(resolve => setTimeout(() => resolve('blocked'), 50)),
    ]);

    expect(racedBeforeRelease).toBe('blocked');
    expect(secondEntered).toBe(false);

    releaseFirst.resolve();

    await firstWrite;
    await secondWrite;

    await expect(firstDatabase.prepare<EventRow>(`
      SELECT id, position
      FROM events
      ORDER BY position
    `).all()).resolves.toEqual([
      { id: 'first', position: 1 },
      { id: 'second', position: 2 },
    ]);
  });

  test('opens encrypted database files normally when the key is supplied', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'local-streamer-primary-sqlite-'));
    workspaces.push(workspace);
    const dbPath = join(workspace, 'storage', 'db.sqlite');
    const database = await createPrimarySqliteDatabase({
      dbPath,
      encryptionKey: TEST_DATABASE_ENCRYPTION_KEY,
    });

    await database.exec(`
      CREATE TABLE secrets (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT
    `);
    await database.prepare('INSERT INTO secrets (id, value) VALUES (?, ?)').run('secret-1', 'encrypted-value');

    await expect(database.prepare<{ value: string }>('SELECT value FROM secrets WHERE id = ?').get('secret-1'))
      .resolves.toEqual({ value: 'encrypted-value' });
  });

  test('does not allow keyless standard opens of encrypted database files', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'local-streamer-primary-sqlite-'));
    workspaces.push(workspace);
    const dbPath = join(workspace, 'storage', 'db.sqlite');
    const database = await createPrimarySqliteDatabase({
      dbPath,
      encryptionKey: TEST_DATABASE_ENCRYPTION_KEY,
    });

    await database.exec('CREATE TABLE encrypted_probe (id TEXT PRIMARY KEY) STRICT');

    const keylessClient = createClient({
      url: `file:${dbPath}`,
    });

    await expect(keylessClient.execute('SELECT * FROM encrypted_probe')).rejects.toThrow();
  });
});
