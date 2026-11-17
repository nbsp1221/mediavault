import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { Mutex } from 'async-mutex';
import Database from 'better-sqlite3-multiple-ciphers';
import { getRequiredDatabaseEncryptionKey } from '~/shared/config/app-config.server';

export type SqliteValue = string | number | bigint | Uint8Array | null;

export interface SqliteRunResult {
  changes: number;
  lastInsertRowid?: bigint;
}

export interface SqliteStatement<RowType = unknown> {
  all: (...params: SqliteValue[]) => Promise<RowType[]>;
  get: (...params: SqliteValue[]) => Promise<RowType | undefined>;
  run: (...params: SqliteValue[]) => Promise<SqliteRunResult>;
}

export interface SqliteDatabaseAdapter {
  exec: (sql: string) => Promise<void>;
  prepare: <RowType = unknown>(sql: string) => SqliteStatement<RowType>;
  transaction: <T>(callback: (database: SqliteDatabaseAdapter) => Promise<T>) => Promise<T>;
}

export interface PrimarySqliteDatabaseAdapter extends SqliteDatabaseAdapter {
  close: () => Promise<void>;
}

export interface CreatePrimarySqliteDatabaseInput {
  dbPath: string;
  encryptionKey?: string;
}

interface PathLock {
  mutex: Mutex;
  connections: number;
}

interface TransactionContext {
  database: Database.Database;
  active: boolean;
}

type Execute = <T>(operation: (database: Database.Database) => T) => Promise<T>;

const pathLocks = new Map<string, PathLock>();
const transactions = new AsyncLocalStorage<ReadonlyMap<string, TransactionContext>>();

function acquirePathLock(dbPath: string): PathLock {
  let lock = pathLocks.get(dbPath);
  if (!lock) {
    lock = { connections: 0, mutex: new Mutex() };
    pathLocks.set(dbPath, lock);
  }
  lock.connections += 1;
  return lock;
}

function releasePathLock(dbPath: string, lock: PathLock) {
  lock.connections -= 1;
  if (lock.connections === 0) {
    pathLocks.delete(dbPath);
  }
}

function assertActive(context: TransactionContext) {
  if (!context.active) {
    throw new Error('Primary storage transaction is no longer active');
  }
}

function createQueries(execute: Execute): Pick<SqliteDatabaseAdapter, 'exec' | 'prepare'> {
  return {
    async exec(sql) {
      await execute((database) => database.exec(sql));
    },
    prepare<RowType = unknown>(sql: string): SqliteStatement<RowType> {
      return {
        all: (...params) =>
          execute((database) => database.prepare<SqliteValue[], RowType>(sql).all(...params)),
        get: (...params) =>
          execute((database) => database.prepare<SqliteValue[], RowType>(sql).get(...params)),
        run: (...params) =>
          execute((database) => {
            const result = database
              .prepare<SqliteValue[]>(sql)
              .safeIntegers()
              .run(...params);
            return { changes: result.changes, lastInsertRowid: BigInt(result.lastInsertRowid) };
          }),
      };
    },
  };
}

function createTransactionAdapter(context: TransactionContext): SqliteDatabaseAdapter {
  return {
    ...createQueries((operation) =>
      Promise.resolve().then(() => {
        assertActive(context);
        return operation(context.database);
      }),
    ),
    transaction: () =>
      Promise.reject(new Error('Nested primary storage transactions are not supported')),
  };
}

function configureEncryptedDatabase(database: Database.Database, encryptionKey: string) {
  // Fixed fresh-install cipher policy. Key bytes are UTF-8 passphrase material, not hex decoding.
  database.pragma("cipher = 'chacha20'");
  database.pragma('legacy = 0');
  database.pragma('kdf_iter = 64007');
  if (
    database.pragma('cipher', { simple: true }) !== 'chacha20' ||
    String(database.pragma('legacy', { simple: true })) !== '0' ||
    String(database.pragma('kdf_iter', { simple: true })) !== '64007'
  ) {
    throw new Error('Primary storage encryption policy is unavailable');
  }
  const key = Buffer.from(encryptionKey, 'utf8');
  try {
    if (database.key(key) !== 0) {
      throw new Error('Primary storage encryption initialization failed');
    }
  } finally {
    key.fill(0);
  }
  // key() alone also succeeds with incorrect keys. Authenticate a real schema read before serving.
  database.prepare('SELECT count(*) FROM sqlite_schema').get();
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  database.pragma('synchronous = FULL');
  if (
    database.pragma('journal_mode = WAL', { simple: true }) !== 'wal' ||
    database.pragma('foreign_keys', { simple: true }) !== 1 ||
    database.pragma('synchronous', { simple: true }) !== 2
  ) {
    throw new Error('Primary storage durability policy is unavailable');
  }
}

function createAdapter(
  database: Database.Database,
  dbPath: string,
  lock: PathLock,
): PrimarySqliteDatabaseAdapter {
  let closed = false;

  const assertOpen = () => {
    if (closed) {
      throw new Error('Primary storage database is closed');
    }
  };

  const closeConnection = () => {
    if (!closed) {
      closed = true;
      try {
        database.close();
      } finally {
        releasePathLock(dbPath, lock);
      }
    }
  };

  const execute: Execute = async (operation) => {
    assertOpen();
    const context = transactions.getStore()?.get(dbPath);
    if (context) {
      assertActive(context);
      return operation(context.database);
    }
    return lock.mutex.runExclusive(() => {
      assertOpen();
      return operation(database);
    });
  };

  return {
    ...createQueries(execute),
    async transaction(callback) {
      if (transactions.getStore()?.has(dbPath)) {
        throw new Error('Nested primary storage transactions are not supported');
      }
      return lock.mutex.runExclusive(async () => {
        assertOpen();
        const context: TransactionContext = { active: true, database };
        const scopedTransactions = new Map(transactions.getStore());
        scopedTransactions.set(dbPath, context);
        database.exec('BEGIN IMMEDIATE');
        try {
          // All same-path reads and writes are locked across awaits. Root-adapter calls in this
          // async scope use this connection too, avoiding self-deadlock and dirty read visibility.
          const result = await transactions.run(scopedTransactions, () =>
            callback(createTransactionAdapter(context)),
          );
          database.exec('COMMIT');
          return result;
        } catch (error) {
          if (database.inTransaction) {
            try {
              database.exec('ROLLBACK');
            } catch (rollbackError) {
              // Never release an uncertain transaction connection back to unrelated requests.
              const errors = [error, rollbackError];
              try {
                closeConnection();
              } catch (closeError) {
                errors.push(closeError);
              }
              throw new AggregateError(errors, 'Primary storage transaction rollback failed', {
                cause: rollbackError,
              });
            }
          }
          throw error;
        } finally {
          context.active = false;
        }
      });
    },
    async close() {
      if (transactions.getStore()?.has(dbPath)) {
        throw new Error('Cannot close primary storage inside a transaction');
      }
      await lock.mutex.runExclusive(closeConnection);
    },
  };
}

export async function createPrimarySqliteDatabase(
  input: CreatePrimarySqliteDatabaseInput,
): Promise<PrimarySqliteDatabaseAdapter> {
  const encryptionKey = input.encryptionKey ?? getRequiredDatabaseEncryptionKey();
  if (encryptionKey.trim().length === 0) {
    throw new Error('Primary storage encryption passphrase is required');
  }
  // SQLite3MC recognizes these reserved key notations even through its Buffer API.
  // This configuration accepts passphrases only; never implicitly bypass the native KDF.
  if (encryptionKey.startsWith('raw:') || /^x'/i.test(encryptionKey)) {
    throw new Error('Primary storage requires a UTF-8 passphrase, not raw-key notation');
  }
  const resolvedPath = resolve(input.dbPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const dbPath = existsSync(resolvedPath)
    ? realpathSync(resolvedPath)
    : join(realpathSync(dirname(resolvedPath)), basename(resolvedPath));
  if (transactions.getStore()?.has(dbPath)) {
    throw new Error('Cannot open another primary storage connection inside a transaction');
  }
  const lock = acquirePathLock(dbPath);
  return lock.mutex.runExclusive(() => {
    let database: Database.Database | undefined;
    try {
      database = new Database(dbPath);
      configureEncryptedDatabase(database, encryptionKey);
      return createAdapter(database, dbPath, lock);
    } catch (error) {
      database?.close();
      releasePathLock(dbPath, lock);
      throw error;
    }
  });
}
