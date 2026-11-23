import type { VideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { ReadyVideoCatalogPort } from '~/modules/library/application/ports/ready-video-catalog.port';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import {
  type CreateInitializedPrimarySqliteDatabase,
  createInitializedPrimarySqliteDatabase,
} from '~/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import { getPrimaryStorageConfig } from '~/shared/config/app-config.server';
import { videoReadScopeSql } from './video-read-scope.sql';

interface Dependencies {
  createDatabase?: CreateInitializedPrimarySqliteDatabase;
  dbPath?: string;
}

interface ReadyVideoRow {
  duration_seconds: number;
  id: string;
  title: string;
}

interface ReadyCatalogRow extends ReadyVideoRow {
  created_at: string;
  description: string | null;
}

export class SqliteReadyVideoCatalogAdapter implements ReadyVideoCatalogPort {
  private readonly createDatabase: CreateInitializedPrimarySqliteDatabase;
  private readonly dbPath: string;
  private databasePromise: Promise<SqliteDatabaseAdapter> | null = null;

  constructor(deps: Dependencies = {}) {
    this.createDatabase = deps.createDatabase ?? createInitializedPrimarySqliteDatabase;
    this.dbPath = deps.dbPath ?? getPrimaryStorageConfig().databasePath;
  }

  private getDatabase(): Promise<SqliteDatabaseAdapter> {
    this.databasePromise ??= this.createDatabase({ dbPath: this.dbPath });
    return this.databasePromise;
  }

  async findReadyVideoById(videoId: string, scope: VideoReadAccessScope) {
    const database = await this.getDatabase();
    const access = videoReadScopeSql(scope);
    const row = await database
      .prepare<ReadyVideoRow>(`
      SELECT videos.id, videos.title, videos.duration_seconds
      FROM videos
      INNER JOIN video_media_assets
        ON video_media_assets.video_id = videos.id AND video_media_assets.status = 'ready'
      WHERE videos.id = ? AND ${access.sql}
    `)
      .get(videoId, ...access.params);
    return row ? mapSummary(row) : null;
  }

  async listReadyVideos(scope: VideoReadAccessScope) {
    const database = await this.getDatabase();
    const access = videoReadScopeSql(scope);
    const rows = await database
      .prepare<ReadyCatalogRow>(`
      SELECT videos.id, videos.title, videos.duration_seconds, videos.created_at, videos.description
      FROM videos
      INNER JOIN video_media_assets
        ON video_media_assets.video_id = videos.id AND video_media_assets.status = 'ready'
      WHERE ${access.sql}
      ORDER BY videos.sort_index DESC
    `)
      .all(...access.params);
    return Promise.all(
      rows.map(async (row) => {
        const tags = await database
          .prepare<{ tag_slug: string }>(`
        SELECT tag_slug FROM video_tags WHERE video_id = ? ORDER BY tag_slug ASC
      `)
          .all(row.id);
        return {
          ...mapSummary(row),
          createdAt: new Date(row.created_at),
          description: row.description ?? undefined,
          tags: tags.map((tag) => tag.tag_slug),
          videoUrl: `/videos/${row.id}/manifest.mpd`,
        };
      }),
    );
  }
}

function mapSummary(row: ReadyVideoRow) {
  return {
    duration: row.duration_seconds,
    id: row.id,
    thumbnailUrl: `/api/thumbnail/${row.id}`,
    title: row.title,
  };
}
