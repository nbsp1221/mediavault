import {
  DEFAULT_VIDEO_CONTENT_TYPES,
  DEFAULT_VIDEO_GENRES,
  type VideoTaxonomyItem,
} from '~/modules/library/domain/video-taxonomy';
import type {
  CreatePrimarySqliteDatabaseInput,
  PrimarySqliteDatabaseAdapter,
  SqliteDatabaseAdapter,
} from './primary-sqlite.database';
import { primarySchemaSql } from './primary-schema.sql';
import { createPrimarySqliteDatabase } from './primary-sqlite.database';

// File identity, not a migration ledger. Unknown formats require an explicit future decision.
export const PRIMARY_STORAGE_APPLICATION_ID = 0x4d564c54; // ASCII MVLT
export const PRIMARY_STORAGE_FORMAT_VERSION = 1;

export type CreateInitializedPrimarySqliteDatabase = (
  input: CreatePrimarySqliteDatabaseInput,
) => Promise<SqliteDatabaseAdapter>;

const expectedTables = [
  'auth_sessions',
  'auth_users',
  'ingest_jobs',
  'ingest_uploads',
  'playlist_items',
  'playlists',
  'tags',
  'video_content_types',
  'video_genre_assignments',
  'video_genres',
  'video_media_assets',
  'video_tags',
  'videos',
];

async function seedVocabulary(
  database: SqliteDatabaseAdapter,
  table: 'video_content_types' | 'video_genres',
  items: VideoTaxonomyItem[],
) {
  const insert = database.prepare(
    `INSERT INTO ${table} (slug, label, active, sort_order) VALUES (?, ?, ?, ?)`,
  );
  for (const item of items) {
    await insert.run(item.slug, item.label, item.active ? 1 : 0, item.sortOrder);
  }
}

async function initialize(database: SqliteDatabaseAdapter) {
  await database.transaction(async (transaction) => {
    const application = await transaction
      .prepare<{ application_id: number }>('PRAGMA application_id')
      .get();
    const format = await transaction.prepare<{ user_version: number }>('PRAGMA user_version').get();
    const objects = await transaction
      .prepare<{ name: string; type: string }>(`
      SELECT name, type FROM sqlite_schema
      WHERE name NOT GLOB 'sqlite_*'
      ORDER BY name
    `)
      .all();
    if (
      application?.application_id === PRIMARY_STORAGE_APPLICATION_ID &&
      format?.user_version === PRIMARY_STORAGE_FORMAT_VERSION
    ) {
      const tables = objects
        .filter((object) => object.type === 'table')
        .map((object) => object.name);
      if (
        tables.length !== expectedTables.length ||
        tables.some((table, index) => table !== expectedTables[index])
      ) {
        throw new Error('Primary storage schema does not match its format marker');
      }
      return;
    }
    if (application?.application_id !== 0 || format?.user_version !== 0 || objects.length !== 0) {
      throw new Error('Unsupported or nonempty uninitialized primary storage database');
    }
    await transaction.exec(primarySchemaSql);
    await seedVocabulary(transaction, 'video_content_types', DEFAULT_VIDEO_CONTENT_TYPES);
    await seedVocabulary(transaction, 'video_genres', DEFAULT_VIDEO_GENRES);
    await transaction.exec(
      `PRAGMA application_id = ${PRIMARY_STORAGE_APPLICATION_ID}; PRAGMA user_version = ${PRIMARY_STORAGE_FORMAT_VERSION}`,
    );
  });
}

export async function createInitializedPrimarySqliteDatabase(
  input: CreatePrimarySqliteDatabaseInput,
): Promise<PrimarySqliteDatabaseAdapter> {
  const database = await createPrimarySqliteDatabase(input);
  try {
    await initialize(database);
    return database;
  } catch (error) {
    await database.close();
    throw error;
  }
}
