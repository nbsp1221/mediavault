import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { TEST_DATABASE_ENCRYPTION_KEY } from '../../../../../tests/support/database-encryption-key';
import type {
  PrimarySqliteDatabaseAdapter,
  SqliteDatabaseAdapter,
} from './primary-sqlite.database';
import { createPrimarySqliteDatabase } from './primary-sqlite.database';

interface EventRow {
  id: string;
  position: number;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const workspaces: string[] = [];
const databases: PrimarySqliteDatabaseAdapter[] = [];

async function databasePath() {
  const workspace = await mkdtemp(join(tmpdir(), 'mediavault-primary-sqlite-'));
  workspaces.push(workspace);
  return join(workspace, 'storage', 'db.sqlite');
}

async function open(dbPath: string, encryptionKey = TEST_DATABASE_ENCRYPTION_KEY) {
  const database = await createPrimarySqliteDatabase({ dbPath, encryptionKey });
  databases.push(database);
  return database;
}

async function createEvents(database: SqliteDatabaseAdapter) {
  await database.exec(
    'CREATE TABLE events (id TEXT PRIMARY KEY, position INTEGER NOT NULL) STRICT',
  );
}

const readEvents = (database: SqliteDatabaseAdapter) =>
  database.prepare<EventRow>('SELECT id, position FROM events ORDER BY position').all();

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map((database) => database.close()));
  await Promise.all(
    workspaces.splice(0).map((workspace) => rm(workspace, { force: true, recursive: true })),
  );
});

describe('createPrimarySqliteDatabase', () => {
  test('serializes concurrent reads, statement writes, and transactions across adapters while awaiting publication', async () => {
    const dbPath = await databasePath();
    const first = await open(dbPath);
    const second = await open(dbPath);
    await createEvents(first);
    const started = deferred();
    const release = deferred();
    const firstWrite = first.transaction(async (transaction) => {
      await transaction.prepare('INSERT INTO events VALUES (?, ?)').run('first', 1);
      started.resolve();
      await release.promise;
    });
    await started.promise;
    let readCompleted = false;
    let statementCompleted = false;
    let transactionEntered = false;
    const sameConnectionRead = readEvents(first).then((rows) => {
      readCompleted = true;
      return rows;
    });
    const otherConnectionRead = readEvents(second);
    const statementWrite = second
      .prepare('INSERT INTO events VALUES (?, ?)')
      .run('second', 2)
      .then(() => {
        statementCompleted = true;
      });
    const transactionWrite = second.transaction(async (transaction) => {
      transactionEntered = true;
      await transaction.prepare('INSERT INTO events VALUES (?, ?)').run('third', 3);
    });
    await setImmediate();
    expect(readCompleted).toBe(false);
    expect(statementCompleted).toBe(false);
    expect(transactionEntered).toBe(false);
    release.resolve();
    await firstWrite;
    await expect(sameConnectionRead).resolves.toEqual([{ id: 'first', position: 1 }]);
    await expect(otherConnectionRead).resolves.toEqual([{ id: 'first', position: 1 }]);
    await Promise.all([statementWrite, transactionWrite]);
    await expect(readEvents(first)).resolves.toEqual([
      { id: 'first', position: 1 },
      { id: 'second', position: 2 },
      { id: 'third', position: 3 },
    ]);
  });

  test('rolls back writes after an awaited publication failure before releasing queued reads and writes', async () => {
    const dbPath = await databasePath();
    const database = await open(dbPath);
    const other = await open(dbPath);
    await createEvents(database);
    const started = deferred();
    const release = deferred();
    const failure = new Error('Publication rename failed');
    const write = database.transaction(async (transaction) => {
      await transaction.prepare('INSERT INTO events VALUES (?, ?)').run('rolled-back', 1);
      started.resolve();
      await release.promise;
      throw failure;
    });
    const failureOutcome = write.catch((error: unknown) => error);
    await started.promise;
    const queuedRead = readEvents(other);
    const queuedWrite = other.prepare('INSERT INTO events VALUES (?, ?)').run('committed', 2);
    release.resolve();
    expect(await failureOutcome).toBe(failure);
    await expect(queuedRead).resolves.toEqual([]);
    await queuedWrite;
    await expect(readEvents(database)).resolves.toEqual([{ id: 'committed', position: 2 }]);
  });

  test('routes outer adapter queries to the active transaction without deadlocking and rejects nested transactions', async () => {
    const dbPath = await databasePath();
    const database = await open(dbPath);
    const other = await open(dbPath);
    await createEvents(database);
    let expired: SqliteDatabaseAdapter | undefined;
    await expect(
      database.transaction(async (transaction) => {
        expired = transaction;
        await database.prepare('INSERT INTO events VALUES (?, ?)').run('outer', 1);
        await expect(readEvents(other)).resolves.toEqual([{ id: 'outer', position: 1 }]);
        await expect(transaction.transaction(async () => undefined)).rejects.toThrow('Nested');
        await expect(other.transaction(async () => undefined)).rejects.toThrow('Nested');
        await expect(database.close()).rejects.toThrow('inside a transaction');
        await expect(open(dbPath)).rejects.toThrow('inside a transaction');
        return 'committed';
      }),
    ).resolves.toBe('committed');
    if (!expired) {
      throw new Error('Transaction fixture did not capture its adapter');
    }
    await expect(expired.prepare('SELECT 1').get()).rejects.toThrow('no longer active');
    await expect(readEvents(database)).resolves.toEqual([{ id: 'outer', position: 1 }]);
  });

  test('uses the fixed current core, explicit cipher policy, WAL, FULL synchronization, and foreign keys', async () => {
    const database = await open(await databasePath());
    await expect(
      database.prepare<{ version: string }>('SELECT sqlite_version() AS version').get(),
    ).resolves.toEqual({ version: '3.53.4' });
    await expect(database.prepare<{ chacha20: string }>('PRAGMA cipher').get()).resolves.toEqual({
      chacha20: 'chacha20',
    });
    await expect(
      database.prepare<{ journal_mode: string }>('PRAGMA journal_mode').get(),
    ).resolves.toEqual({ journal_mode: 'wal' });
    await expect(
      database.prepare<{ synchronous: number }>('PRAGMA synchronous').get(),
    ).resolves.toEqual({ synchronous: 2 });
    await expect(
      database.prepare<{ foreign_keys: number }>('PRAGMA foreign_keys').get(),
    ).resolves.toEqual({ foreign_keys: 1 });
    await database.exec(
      'CREATE TABLE parents (id TEXT PRIMARY KEY); CREATE TABLE children (parent_id TEXT REFERENCES parents(id))',
    );
    await expect(
      database.prepare('INSERT INTO children VALUES (?)').run('missing'),
    ).rejects.toThrow('FOREIGN KEY');
    await expect(
      database.transaction(async (transaction) => {
        await transaction.prepare('INSERT INTO parents VALUES (?)').run('rolled-back');
        await transaction.prepare('INSERT INTO children VALUES (?)').run('missing');
      }),
    ).rejects.toThrow('FOREIGN KEY');
    await expect(database.prepare('SELECT * FROM parents').all()).resolves.toEqual([]);
    await expect(database.prepare('PRAGMA integrity_check').get()).resolves.toEqual({
      integrity_check: 'ok',
    });
  });

  test('closes an uncertain connection if rollback fails instead of exposing its uncommitted data', async () => {
    const dbPath = await databasePath();
    const database = await open(dbPath);
    const other = await open(dbPath);
    await createEvents(database);
    // oxlint-disable-next-line typescript/unbound-method -- The fault injector explicitly restores the native receiver with call().
    const execute = Database.prototype.exec;
    const rollbackFailure = new Error('Injected rollback I/O failure');
    const publicationFailure = new Error('Injected publication failure');
    const spy = vi.spyOn(Database.prototype, 'exec').mockImplementation(function (
      this: Database.Database,
      sql,
    ) {
      if (sql === 'ROLLBACK') {
        throw rollbackFailure;
      }
      return execute.call(this, sql);
    });
    const failed = database.transaction(async (transaction) => {
      await transaction.prepare('INSERT INTO events VALUES (?, ?)').run('uncertain', 1);
      await setImmediate();
      throw publicationFailure;
    });
    await expect(failed).rejects.toMatchObject({ errors: [publicationFailure, rollbackFailure] });
    spy.mockRestore();
    await expect(readEvents(database)).rejects.toThrow('closed');
    await expect(readEvents(other)).resolves.toEqual([]);
    await other.prepare('INSERT INTO events VALUES (?, ?)').run('safe', 2);
  });

  test('preserves bound values and exact bigint insert identifiers', async () => {
    const database = await open(await databasePath());
    await database.exec(
      'CREATE TABLE bindings (id INTEGER PRIMARY KEY, label TEXT, payload BLOB, optional TEXT)',
    );
    const inserted = await database
      .prepare('INSERT INTO bindings VALUES (?, ?, ?, ?)')
      .run(9007199254740993n, '한글 passphrase fixture', new Uint8Array([0, 1, 255]), null);
    expect(inserted).toEqual({ changes: 1, lastInsertRowid: 9007199254740993n });
    await expect(
      database.prepare('SELECT label, payload, optional FROM bindings').get(),
    ).resolves.toEqual({
      label: '한글 passphrase fixture',
      payload: Buffer.from([0, 1, 255]),
      optional: null,
    });
    await expect(
      database.prepare('SELECT label FROM bindings WHERE id = ?').get(9007199254740993n),
    ).resolves.toEqual({ label: '한글 passphrase fixture' });
  });

  test('encrypts database and WAL content, closes safely, and reopens only with the correct key', async () => {
    const dbPath = await databasePath();
    const database = await open(dbPath, '같은 접두사 암호: correct');
    const marker = 'encrypted-sensitive-value-62d291b1';
    await database.exec('CREATE TABLE secrets (value TEXT NOT NULL) STRICT');
    await database.prepare('INSERT INTO secrets VALUES (?)').run(marker);
    for (const path of [dbPath, `${dbPath}-wal`]) {
      expect((await readFile(path)).includes(Buffer.from(marker))).toBe(false);
    }
    await database.close();
    await database.close();
    expect((await readFile(dbPath)).subarray(0, 16).toString()).not.toBe('SQLite format 3\0');
    await expect(open(dbPath, '같은 접두사 암호: wrong')).rejects.toThrow();
    const keyless = new Database(dbPath);
    try {
      expect(() => keyless.prepare('SELECT * FROM secrets').all()).toThrow();
    } finally {
      keyless.close();
    }
    const reopened = await open(dbPath, '같은 접두사 암호: correct');
    await expect(reopened.prepare('SELECT value FROM secrets').get()).resolves.toEqual({
      value: marker,
    });
    await expect(database.prepare('SELECT 1').get()).rejects.toThrow();
  });

  test.each([
    `raw:${'a'.repeat(32)}`,
    `raw:${'a'.repeat(64)}`,
    `x'${'a'.repeat(64)}'`,
    `X'${'a'.repeat(96)}'`,
    'raw:short-is-still-reserved',
  ])('rejects reserved raw-key notation without creating a database (%#)', async (passphrase) => {
    const dbPath = await databasePath();
    await expect(open(dbPath, passphrase)).rejects.toThrow('not raw-key notation');
    await expect(readFile(dbPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('uses the full unchanged UTF-8 passphrase with native SQLite3MC tooling', async () => {
    const dbPath = await databasePath();
    const passphrase = "  한글's e\u0301🔐尾  ";
    const database = await open(dbPath, passphrase);
    await createEvents(database);
    await database.prepare('INSERT INTO events VALUES (?, ?)').run('interoperable', 1);
    await database.close();
    await expect(open(dbPath, passphrase.trim())).rejects.toThrow();
    await expect(open(dbPath, passphrase.normalize('NFC'))).rejects.toThrow();
    const native = new Database(dbPath);
    try {
      expect(native.key(Buffer.from(passphrase, 'utf8'))).toBe(0);
      expect(native.prepare('SELECT * FROM events').all()).toEqual([
        { id: 'interoperable', position: 1 },
      ]);
    } finally {
      native.close();
    }
  });

  test('treats bare hex-looking text as a derived passphrase, never an implicit raw key', async () => {
    const dbPath = await databasePath();
    const passphrase = 'ab'.repeat(32);
    const database = await open(dbPath, passphrase);
    await createEvents(database);
    await database.close();
    const nativeRaw = new Database(dbPath);
    try {
      expect(nativeRaw.key(Buffer.from(`raw:${passphrase}`, 'utf8'))).toBe(0);
      expect(() => nativeRaw.prepare('SELECT * FROM events').all()).toThrow();
    } finally {
      nativeRaw.close();
    }
    const reopened = await open(dbPath, passphrase);
    await expect(readEvents(reopened)).resolves.toEqual([]);
  });

  test('rejects blank passphrases and existing plaintext files without converting them', async () => {
    const dbPath = await databasePath();
    await expect(open(dbPath, '  ')).rejects.toThrow('passphrase is required');
    await mkdir(dirname(dbPath), { recursive: true });
    const plaintext = new Database(dbPath);
    plaintext.exec('CREATE TABLE plaintext_probe (value TEXT)');
    plaintext.close();
    const before = await readFile(dbPath);
    await expect(open(dbPath)).rejects.toThrow();
    expect(await readFile(dbPath)).toEqual(before);
  });
});
