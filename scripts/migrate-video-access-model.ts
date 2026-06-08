#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import type { SqliteDatabaseAdapter } from '../app/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { createPrimarySqliteDatabase } from '../app/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { normalizeUsernameKey } from '../app/modules/user/domain/value-objects/username';
import { getPrimaryStorageConfig } from '../app/shared/config/app-config.server';

interface MigrationOptions {
  dryRun: boolean;
  ownerUsername: string;
}

interface TableInfoRow {
  name: string;
  notnull: number;
}

interface UserRow {
  id: string;
  username: string;
}

function parseArgs(argv: string[]): MigrationOptions {
  const ownerUsernameIndex = argv.indexOf('--owner-username');
  const ownerUsername = ownerUsernameIndex >= 0
    ? argv[ownerUsernameIndex + 1]
    : undefined;

  if (!ownerUsername?.trim()) {
    throw new Error('Usage: bun scripts/migrate-video-access-model.ts --owner-username <username> [--dry-run]');
  }

  return {
    dryRun: argv.includes('--dry-run'),
    ownerUsername,
  };
}

async function getVideosTableInfo(database: SqliteDatabaseAdapter): Promise<TableInfoRow[]> {
  return database.prepare<TableInfoRow>(`
    PRAGMA table_info(videos)
  `).all();
}

function hasColumn(rows: TableInfoRow[], name: string): boolean {
  return rows.some(row => row.name === name);
}

function hasRequiredColumn(rows: TableInfoRow[], name: string): boolean {
  return rows.some(row => row.name === name && row.notnull === 1);
}

async function findOwner(database: SqliteDatabaseAdapter, ownerUsername: string): Promise<UserRow> {
  const usernameKey = normalizeUsernameKey(ownerUsername);
  if (!usernameKey) {
    throw new Error('Owner username is required.');
  }

  const owner = await database.prepare<UserRow>(`
    SELECT id, username
    FROM auth_users
    WHERE username_key = ?
  `).get(usernameKey);

  if (!owner) {
    throw new Error(`Owner user does not exist: ${ownerUsername}`);
  }

  return owner;
}

function createCopySelect(input: {
  hasOwnerId: boolean;
  hasVisibility: boolean;
}) {
  const ownerExpr = input.hasOwnerId
    ? 'COALESCE(owner_id, ?)'
    : '?';
  const visibilityExpr = input.hasVisibility
    ? 'CASE WHEN visibility IN (\'private\', \'public\') THEN visibility ELSE \'private\' END'
    : '\'private\'';

  return `
    SELECT
      id,
      title,
      description,
      duration_seconds,
      content_type_slug,
      ${ownerExpr} AS owner_id,
      ${visibilityExpr} AS visibility,
      created_at,
      updated_at,
      sort_index
    FROM videos
  `;
}

async function normalizeVideosTable(input: {
  database: SqliteDatabaseAdapter;
  ownerId: string;
  tableInfo: TableInfoRow[];
}) {
  const { database, ownerId, tableInfo } = input;
  const hasOwnerId = hasColumn(tableInfo, 'owner_id');
  const hasVisibility = hasColumn(tableInfo, 'visibility');

  await database.exec('PRAGMA foreign_keys = OFF');
  try {
    await database.transaction(async (transaction) => {
      await transaction.exec(`
        CREATE TABLE videos_normalized (
          id TEXT PRIMARY KEY CHECK (
            length(trim(id)) > 0
            AND id = trim(id)
            AND id NOT IN ('.', '..')
            AND instr(id, '..') = 0
            AND instr(id, '/') = 0
            AND instr(id, char(92)) = 0
            AND instr(id, char(0)) = 0
          ),
          title TEXT NOT NULL CHECK (length(trim(title)) > 0),
          description TEXT,
          duration_seconds REAL NOT NULL CHECK (duration_seconds >= 0),
          content_type_slug TEXT REFERENCES video_content_types(slug) ON UPDATE CASCADE ON DELETE RESTRICT,
          owner_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
          visibility TEXT NOT NULL CHECK (visibility IN ('private', 'public')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          sort_index INTEGER NOT NULL UNIQUE
        ) STRICT;
      `);
      await transaction.prepare(`
        INSERT INTO videos_normalized (
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
        )
        ${createCopySelect({ hasOwnerId, hasVisibility })}
      `).run(ownerId);
      await transaction.exec('DROP TABLE videos');
      await transaction.exec('ALTER TABLE videos_normalized RENAME TO videos');
      await transaction.exec(`
        CREATE INDEX idx_videos_owner_id
          ON videos(owner_id);

        CREATE INDEX idx_videos_visibility_sort_index
          ON videos(visibility, sort_index);

        CREATE INDEX idx_videos_owner_visibility_sort_index
          ON videos(owner_id, visibility, sort_index);
      `);
    });
  }
  finally {
    await database.exec('PRAGMA foreign_keys = ON');
  }
}

function getNormalizationStatus(input: {
  alreadyNormalized: boolean;
  dryRun: boolean;
}): 'already_normalized' | 'planned' | 'completed' {
  if (input.alreadyNormalized) {
    return 'already_normalized';
  }

  if (input.dryRun) {
    return 'planned';
  }

  return 'completed';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = getPrimaryStorageConfig();

  if (!existsSync(config.databasePath)) {
    throw new Error(`Primary database does not exist: ${config.databasePath}`);
  }

  const database = await createPrimarySqliteDatabase({
    dbPath: config.databasePath,
  });
  const owner = await findOwner(database, options.ownerUsername);
  const tableInfo = await getVideosTableInfo(database);
  const videoCount = await database.prepare<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM videos
  `).get();
  const alreadyNormalized =
    hasRequiredColumn(tableInfo, 'owner_id') &&
    hasRequiredColumn(tableInfo, 'visibility');

  if (!options.dryRun && !alreadyNormalized) {
    await normalizeVideosTable({
      database,
      ownerId: owner.id,
      tableInfo,
    });
  }

  const report = {
    databasePath: config.databasePath,
    dryRun: options.dryRun,
    normalized: getNormalizationStatus({
      alreadyNormalized,
      dryRun: options.dryRun,
    }),
    ownerId: owner.id,
    ownerUsername: owner.username,
    videoCount: videoCount?.count ?? 0,
  };

  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  try {
    await main();
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
