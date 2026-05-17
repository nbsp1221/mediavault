import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Client, InValue, Transaction } from '@libsql/client';
import { createClient } from '@libsql/client';
import { Mutex } from 'async-mutex';
import { getRequiredDatabaseEncryptionKey } from '../config/storage-config.server';

export interface SqliteRunResult {
  changes: number;
  lastInsertRowid?: bigint;
}

export interface SqliteStatement<RowType = unknown> {
  all: (...params: InValue[]) => Promise<RowType[]>;
  get: (...params: InValue[]) => Promise<RowType | undefined>;
  run: (...params: InValue[]) => Promise<SqliteRunResult>;
}

export interface SqliteDatabaseAdapter {
  exec: (sql: string) => Promise<void>;
  prepare: <RowType = unknown>(sql: string) => SqliteStatement<RowType>;
  transaction: <T>(callback: (database: SqliteDatabaseAdapter) => Promise<T>) => Promise<T>;
}

export interface CreatePrimarySqliteDatabaseInput {
  dbPath: string;
  encryptionKey?: string;
}

const writeMutexes = new Map<string, Mutex>();

interface StatementExecutor {
  execute: Client['execute'];
}

function getWriteMutex(dbPath: string): Mutex {
  const key = resolve(dbPath);
  let mutex = writeMutexes.get(key);

  if (!mutex) {
    mutex = new Mutex();
    writeMutexes.set(key, mutex);
  }

  return mutex;
}

function createStatement<RowType>(
  executor: StatementExecutor,
  sql: string,
  writeMutex?: Mutex,
): SqliteStatement<RowType> {
  return {
    async all(...params) {
      const result = await executor.execute({
        args: params,
        sql,
      });

      return result.rows as RowType[];
    },

    async get(...params) {
      const rows = await this.all(...params);
      return rows[0];
    },

    async run(...params) {
      const executeRun = async () => {
        const result = await executor.execute({
          args: params,
          sql,
        });

        return {
          changes: result.rowsAffected,
          lastInsertRowid: result.lastInsertRowid,
        };
      };

      return writeMutex ? writeMutex.runExclusive(executeRun) : executeRun();
    },
  };
}

function createTransactionAdapter(transaction: Transaction): SqliteDatabaseAdapter {
  return {
    async exec(sql) {
      await transaction.executeMultiple(sql);
    },

    prepare<RowType = unknown>(sql: string) {
      return createStatement<RowType>(transaction, sql);
    },

    async transaction<T>(_callback: (database: SqliteDatabaseAdapter) => Promise<T>) {
      throw new Error('Nested primary storage transactions are not supported');
    },
  };
}

function createLibsqlAdapter(client: Client, writeMutex: Mutex): SqliteDatabaseAdapter {
  return {
    async exec(sql) {
      await writeMutex.runExclusive(async () => {
        await client.executeMultiple(sql);
      });
    },

    prepare<RowType = unknown>(sql: string) {
      return createStatement<RowType>(client, sql, writeMutex);
    },

    async transaction<T>(callback: (database: SqliteDatabaseAdapter) => Promise<T>) {
      return writeMutex.runExclusive(async () => {
        const transaction = await client.transaction('write');
        const transactionAdapter = createTransactionAdapter(transaction);

        try {
          const result = await callback(transactionAdapter);
          await transaction.commit();
          return result;
        }
        catch (error) {
          await transaction.rollback();
          throw error;
        }
      });
    },
  };
}

function toFileDatabaseUrl(dbPath: string): string {
  return pathToFileURL(dbPath).href;
}

export async function createPrimarySqliteDatabase(
  input: CreatePrimarySqliteDatabaseInput,
): Promise<SqliteDatabaseAdapter> {
  mkdirSync(dirname(input.dbPath), { recursive: true });
  const encryptionKey = input.encryptionKey ?? getRequiredDatabaseEncryptionKey();

  const client = createClient({
    encryptionKey,
    url: toFileDatabaseUrl(input.dbPath),
  });
  const database = createLibsqlAdapter(client, getWriteMutex(input.dbPath));

  await database.exec('PRAGMA foreign_keys = ON');
  await database.exec('PRAGMA busy_timeout = 5000');
  await database.exec('PRAGMA journal_mode = WAL');

  return database;
}
