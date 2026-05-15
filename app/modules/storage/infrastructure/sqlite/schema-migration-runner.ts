import {
  type VideoTaxonomyItem,
  DEFAULT_VIDEO_CONTENT_TYPES,
  DEFAULT_VIDEO_GENRES,
} from '~/modules/library/domain/video-taxonomy';
import type { SqliteDatabaseAdapter } from './primary-sqlite.database';
import { accountAuthMigrationSql } from './account-auth-migration.sql';
import { primaryStorageMigrationSql } from './primary-storage-migration.sql';

export interface MigrationDefinition {
  filename?: string;
  name: string;
  sql?: string;
  version: number;
}

interface MigrationRow {
  version: number;
}

export interface RunPrimaryStorageMigrationsInput {
  database: SqliteDatabaseAdapter;
  migrations?: MigrationDefinition[];
}

const migrations: MigrationDefinition[] = [
  {
    name: 'primary_storage',
    sql: primaryStorageMigrationSql,
    version: 1,
  },
  {
    name: 'account_auth',
    sql: accountAuthMigrationSql,
    version: 2,
  },
];

async function ensureMigrationTable(database: SqliteDatabaseAdapter) {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT
  `);
}

async function getAppliedMigrationVersions(database: SqliteDatabaseAdapter) {
  const rows = await database.prepare<MigrationRow>(`
    SELECT version
    FROM schema_migrations
  `).all();

  return new Set(rows.map(row => row.version));
}

function readMigrationSql(migration: MigrationDefinition) {
  if (migration.sql !== undefined) {
    return migration.sql;
  }

  if (migration.filename === undefined) {
    throw new Error(`Migration ${migration.version} has neither inline SQL nor filename`);
  }

  throw new Error(`Migration ${migration.version} uses a filename-only SQL source that is not bundled`);
}

async function seedVocabularyTable(
  database: SqliteDatabaseAdapter,
  tableName: 'video_content_types' | 'video_genres',
  items: VideoTaxonomyItem[],
) {
  const insert = database.prepare(`
    INSERT INTO ${tableName} (slug, label, active, sort_order)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(slug) DO NOTHING
  `);

  for (const item of items) {
    await insert.run(
      item.slug,
      item.label,
      item.active ? 1 : 0,
      item.sortOrder,
    );
  }
}

async function seedInitialVocabulary(database: SqliteDatabaseAdapter) {
  await database.transaction(async (transaction) => {
    await seedVocabularyTable(transaction, 'video_content_types', DEFAULT_VIDEO_CONTENT_TYPES);
    await seedVocabularyTable(transaction, 'video_genres', DEFAULT_VIDEO_GENRES);
  });
}

export async function runPrimaryStorageMigrations(
  input: RunPrimaryStorageMigrationsInput,
): Promise<void> {
  const { database } = input;
  const migrationDefinitions = input.migrations ?? migrations;

  await database.exec('PRAGMA foreign_keys = ON');
  await ensureMigrationTable(database);

  const appliedVersions = await getAppliedMigrationVersions(database);

  for (const migration of migrationDefinitions) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    const sql = readMigrationSql(migration);

    await database.transaction(async (transaction) => {
      await transaction.exec(sql);
      await transaction.prepare(`
        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES (?, ?, ?)
      `).run(migration.version, migration.name, new Date().toISOString());
    });
  }

  await seedInitialVocabulary(database);
}
