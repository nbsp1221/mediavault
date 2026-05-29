import { v4 as uuidv4 } from 'uuid';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { type CreateMigratedPrimarySqliteDatabase, createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import type { VideoReadAccessScope } from '../../application/policies/video-read-access-scope';
import type { LibraryVideo } from '../../domain/library-video';
import type { VideoTaxonomyItem } from '../../domain/video-taxonomy';
import { type VideoVisibility, createVideoVisibility } from '../../domain/value-objects/video-visibility';
import { normalizeVideoTags } from '../../domain/video-tag';
import { normalizeTaxonomySlug, normalizeTaxonomySlugs } from '../../domain/video-taxonomy';

interface SqliteLibraryVideoMetadataRepositoryOptions {
  createDatabase?: CreateMigratedPrimarySqliteDatabase;
  dbPath: string;
}

interface LibraryVideoRow {
  content_type_slug: string | null;
  created_at: string;
  description: string | null;
  duration_seconds: number;
  id: string;
  owner_id: string;
  sort_index: number;
  title: string;
  visibility: string;
}

interface VideoTaxonomyRow {
  active: number;
  label: string;
  slug: string;
  sort_order: number;
}

export interface CreateLibraryVideoMetadataInput {
  contentTypeSlug?: string;
  createdAt?: Date;
  description?: string;
  duration?: number;
  genreSlugs?: string[];
  id?: string;
  ownerId: string;
  sortIndex?: number;
  tags: string[];
  thumbnailUrl?: string;
  title: string;
  videoUrl: string;
  visibility: VideoVisibility;
}

export interface UpdateLibraryVideoMetadataInput {
  contentTypeSlug?: string | null;
  description?: string;
  duration?: number;
  genreSlugs?: string[];
  tags?: string[];
  thumbnailUrl?: string;
  title?: string;
  videoUrl?: string;
}

export class SqliteLibraryVideoMetadataRepository {
  private readonly createDatabase: CreateMigratedPrimarySqliteDatabase;
  private readonly dbPath: string;
  private databasePromise: Promise<SqliteDatabaseAdapter> | null = null;

  constructor(options: SqliteLibraryVideoMetadataRepositoryOptions) {
    this.createDatabase = options.createDatabase ?? createMigratedPrimarySqliteDatabase;
    this.dbPath = options.dbPath;
  }

  private async getDatabase(): Promise<SqliteDatabaseAdapter> {
    if (!this.databasePromise) {
      this.databasePromise = this.createDatabase({
        dbPath: this.dbPath,
      });
    }

    return this.databasePromise;
  }

  async count(): Promise<number> {
    const database = await this.getDatabase();
    const row = await database.prepare<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM videos
    `).get();

    return row?.count ?? 0;
  }

  async create(input: CreateLibraryVideoMetadataInput): Promise<LibraryVideo> {
    const database = await this.getDatabase();
    const createdAt = input.createdAt ?? new Date();
    const id = input.id ?? uuidv4();

    await database.transaction(async (transaction) => {
      await transaction.prepare(`
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
        ) VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          COALESCE(?, COALESCE((SELECT MAX(sort_index) FROM videos), 0) + 1)
        )
      `).run(
        id,
        input.title,
        input.description ?? null,
        input.duration ?? 0,
        normalizeNullableTaxonomySlug(input.contentTypeSlug),
        input.ownerId,
        input.visibility,
        createdAt.toISOString(),
        createdAt.toISOString(),
        input.sortIndex ?? null,
      );

      await replaceVideoTags(transaction, id, input.tags);
      await replaceVideoGenreAssignments(transaction, id, input.genreSlugs ?? []);
    });

    const created = await this.findById(id);
    if (!created) {
      throw new Error(`Failed to create video metadata for ${id}`);
    }

    return created;
  }

  async delete(id: string): Promise<boolean> {
    const database = await this.getDatabase();
    const result = await database.transaction(async (transaction) => {
      await transaction.prepare(`
        DELETE FROM ingest_uploads
        WHERE committed_video_id = ?
      `).run(id);

      return transaction.prepare(`
        DELETE FROM videos
        WHERE id = ?
      `).run(id);
    });

    return (result.changes ?? 0) > 0;
  }

  async exists(id: string): Promise<boolean> {
    return (await this.findById(id)) !== null;
  }

  async findAll(): Promise<LibraryVideo[]> {
    const database = await this.getDatabase();
    const rows = await database.prepare<LibraryVideoRow>(`
      SELECT
        id,
        title,
        description,
        duration_seconds,
        content_type_slug,
        owner_id,
        visibility,
        created_at,
        sort_index
      FROM videos
      ORDER BY sort_index DESC
    `).all();

    return Promise.all(rows.map(row => mapRowToLibraryVideo(database, row)));
  }

  async findAllByReadAccessScope(scope: VideoReadAccessScope): Promise<LibraryVideo[]> {
    const database = await this.getDatabase();
    const rows = scope.type === 'public_only'
      ? await database.prepare<LibraryVideoRow>(`
          SELECT
            id,
            title,
            description,
            duration_seconds,
            content_type_slug,
            owner_id,
            visibility,
            created_at,
            sort_index
          FROM videos
          WHERE (visibility = 'public')
          ORDER BY sort_index DESC
        `).all()
      : await database.prepare<LibraryVideoRow>(`
          SELECT
            id,
            title,
            description,
            duration_seconds,
            content_type_slug,
            owner_id,
            visibility,
            created_at,
            sort_index
          FROM videos
          WHERE (visibility = 'public' OR owner_id = ?)
          ORDER BY sort_index DESC
        `).all(scope.ownerId);

    return Promise.all(rows.map(row => mapRowToLibraryVideo(database, row)));
  }

  async findById(id: string): Promise<LibraryVideo | null> {
    const database = await this.getDatabase();
    const row = await database.prepare<LibraryVideoRow>(`
      SELECT
        id,
        title,
        description,
        duration_seconds,
        content_type_slug,
        owner_id,
        visibility,
        created_at,
        sort_index
      FROM videos
      WHERE id = ?
    `).get(id);

    return row ? mapRowToLibraryVideo(database, row) : null;
  }

  async findOwnedById(id: string, ownerId: string): Promise<LibraryVideo | null> {
    const database = await this.getDatabase();
    const row = await database.prepare<LibraryVideoRow>(`
      SELECT
        id,
        title,
        description,
        duration_seconds,
        content_type_slug,
        owner_id,
        visibility,
        created_at,
        sort_index
      FROM videos
      WHERE id = ? AND owner_id = ?
    `).get(id, ownerId);

    return row ? mapRowToLibraryVideo(database, row) : null;
  }

  async updateVisibility(
    id: string,
    ownerId: string,
    visibility: VideoVisibility,
  ): Promise<LibraryVideo | null> {
    const database = await this.getDatabase();
    const result = await database.prepare(`
      UPDATE videos
      SET
        visibility = ?,
        updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(
      visibility,
      new Date().toISOString(),
      id,
      ownerId,
    );

    if ((result.changes ?? 0) === 0) {
      return null;
    }

    return this.findOwnedById(id, ownerId);
  }

  async findByIdByReadAccessScope(id: string, scope: VideoReadAccessScope): Promise<LibraryVideo | null> {
    const database = await this.getDatabase();
    const row = scope.type === 'public_only'
      ? await database.prepare<LibraryVideoRow>(`
          SELECT
            id,
            title,
            description,
            duration_seconds,
            content_type_slug,
            owner_id,
            visibility,
            created_at,
            sort_index
          FROM videos
          WHERE id = ? AND (visibility = 'public')
        `).get(id)
      : await database.prepare<LibraryVideoRow>(`
          SELECT
            id,
            title,
            description,
            duration_seconds,
            content_type_slug,
            owner_id,
            visibility,
            created_at,
            sort_index
          FROM videos
          WHERE id = ? AND (visibility = 'public' OR owner_id = ?)
        `).get(id, scope.ownerId);

    return row ? mapRowToLibraryVideo(database, row) : null;
  }

  async findByTag(tag: string): Promise<LibraryVideo[]> {
    const normalizedTag = tag.toLowerCase();
    const videos = await this.findAll();

    return videos.filter(video => video.tags.some(
      videoTag => videoTag.toLowerCase() === normalizedTag,
    ));
  }

  async findByTitle(title: string): Promise<LibraryVideo[]> {
    const normalizedTitle = title.toLowerCase();
    const videos = await this.findAll();

    return videos.filter(video => video.title.toLowerCase().includes(normalizedTitle));
  }

  async getAllTags(): Promise<string[]> {
    const videos = await this.findAll();
    const tagSet = new Set<string>();

    for (const video of videos) {
      for (const tag of video.tags) {
        tagSet.add(tag);
      }
    }

    return Array.from(tagSet).sort();
  }

  async search(query: string): Promise<LibraryVideo[]> {
    const normalizedQuery = query.toLowerCase();
    const videos = await this.findAll();

    return videos.filter(video => (
      video.title.toLowerCase().includes(normalizedQuery) ||
      video.tags.some(tag => tag.toLowerCase().includes(normalizedQuery))
    ));
  }

  async update(
    id: string,
    updates: UpdateLibraryVideoMetadataInput,
  ): Promise<LibraryVideo | null> {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    const database = await this.getDatabase();
    const nextContentTypeSlug = getNextNullableMetadataValue(
      updates,
      'contentTypeSlug',
      existing.contentTypeSlug,
    );
    const nextGenreSlugs = getNextListMetadataValue(
      updates,
      'genreSlugs',
      existing.genreSlugs ?? [],
    );
    await database.transaction(async (transaction) => {
      await transaction.prepare(`
        UPDATE videos
        SET
          title = ?,
          description = ?,
          duration_seconds = ?,
          content_type_slug = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        updates.title ?? existing.title,
        typeof updates.description === 'undefined'
          ? existing.description ?? null
          : updates.description ?? null,
        updates.duration ?? existing.duration,
        normalizeNullableTaxonomySlug(nextContentTypeSlug),
        new Date().toISOString(),
        id,
      );

      await replaceVideoTags(transaction, id, updates.tags ?? existing.tags);
      await replaceVideoGenreAssignments(transaction, id, nextGenreSlugs);
    });

    return this.findById(id);
  }

  async listActiveContentTypes(): Promise<VideoTaxonomyItem[]> {
    return this.listActiveVocabulary('video_content_types');
  }

  async listActiveGenres(): Promise<VideoTaxonomyItem[]> {
    return this.listActiveVocabulary('video_genres');
  }

  private async listActiveVocabulary(
    tableName: 'video_content_types' | 'video_genres',
  ): Promise<VideoTaxonomyItem[]> {
    const database = await this.getDatabase();
    const rows = await database.prepare<VideoTaxonomyRow>(`
      SELECT slug, label, active, sort_order
      FROM ${tableName}
      WHERE active = 1
      ORDER BY sort_order ASC, label ASC
    `).all();

    return rows.map(row => ({
      active: row.active === 1,
      label: row.label,
      slug: row.slug,
      sortOrder: row.sort_order,
    }));
  }
}

async function mapRowToLibraryVideo(
  database: SqliteDatabaseAdapter,
  row: LibraryVideoRow,
): Promise<LibraryVideo> {
  const visibility = createVideoVisibility(row.visibility);
  if (!visibility.ok) {
    throw new Error(`Invalid video visibility for ${row.id}`);
  }

  return {
    contentTypeSlug: row.content_type_slug ?? undefined,
    createdAt: new Date(row.created_at),
    description: row.description ?? undefined,
    duration: row.duration_seconds,
    genreSlugs: await loadGenreSlugs(database, row.id),
    id: row.id,
    ownerId: row.owner_id,
    tags: await loadTagSlugs(database, row.id),
    thumbnailUrl: `/api/thumbnail/${row.id}`,
    title: row.title,
    videoUrl: `/videos/${row.id}/manifest.mpd`,
    visibility: visibility.visibility,
  };
}

function getNextNullableMetadataValue<
  TUpdates extends object,
  TKey extends keyof TUpdates,
>(
  updates: TUpdates,
  key: TKey,
  existingValue: string | undefined,
): string | null {
  const nextValue = updates[key];

  if (!Object.hasOwn(updates, key) || typeof nextValue === 'undefined') {
    return existingValue ?? null;
  }

  return (nextValue as string | null) ?? null;
}

function getNextListMetadataValue<
  TUpdates extends object,
  TKey extends keyof TUpdates,
>(
  updates: TUpdates,
  key: TKey,
  existingValue: string[],
): string[] {
  const nextValue = updates[key];

  return Object.hasOwn(updates, key) && Array.isArray(nextValue)
    ? nextValue
    : existingValue;
}

function normalizeNullableTaxonomySlug(value: string | null | undefined): string | null {
  return value ? normalizeTaxonomySlug(value) : null;
}

async function replaceVideoTags(
  database: SqliteDatabaseAdapter,
  videoId: string,
  rawTags: string[],
) {
  const tags = normalizeVideoTags(rawTags);

  await database.prepare(`
    DELETE FROM video_tags
    WHERE video_id = ?
  `).run(videoId);

  for (const tag of tags) {
    await database.prepare(`
      INSERT INTO tags (slug, label, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(slug) DO NOTHING
    `).run(tag, tag, new Date().toISOString());
    await database.prepare(`
      INSERT INTO video_tags (video_id, tag_slug)
      VALUES (?, ?)
    `).run(videoId, tag);
  }
}

async function replaceVideoGenreAssignments(
  database: SqliteDatabaseAdapter,
  videoId: string,
  rawGenreSlugs: string[],
) {
  const genreSlugs = normalizeTaxonomySlugs(rawGenreSlugs);

  await database.prepare(`
    DELETE FROM video_genre_assignments
    WHERE video_id = ?
  `).run(videoId);

  for (const genreSlug of genreSlugs) {
    await database.prepare(`
      INSERT INTO video_genre_assignments (video_id, genre_slug)
      VALUES (?, ?)
    `).run(videoId, genreSlug);
  }
}

async function loadTagSlugs(database: SqliteDatabaseAdapter, videoId: string): Promise<string[]> {
  const rows = await database.prepare<{ tag_slug: string }>(`
    SELECT tag_slug
    FROM video_tags
    WHERE video_id = ?
    ORDER BY tag_slug ASC
  `).all(videoId);

  return rows.map(row => row.tag_slug);
}

async function loadGenreSlugs(database: SqliteDatabaseAdapter, videoId: string): Promise<string[]> {
  const rows = await database.prepare<{ genre_slug: string }>(`
    SELECT genre_slug
    FROM video_genre_assignments
    WHERE video_id = ?
    ORDER BY genre_slug ASC
  `).all(videoId);

  return rows.map(row => row.genre_slug);
}
