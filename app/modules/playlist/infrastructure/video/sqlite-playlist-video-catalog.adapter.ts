import type { VideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { PlaylistItem } from '~/modules/playlist/domain/playlist';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { getPrimaryStorageConfig } from '~/modules/storage/infrastructure/config/storage-config.server';
import { type CreateMigratedPrimarySqliteDatabase, createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';

interface SqlitePlaylistVideoCatalogOptions {
  createDatabase?: CreateMigratedPrimarySqliteDatabase;
  dbPath?: string;
}

interface PlaylistVideoRow {
  duration_seconds: number;
  id: string;
  title: string;
}

export class SqlitePlaylistVideoCatalog {
  private readonly createDatabase: CreateMigratedPrimarySqliteDatabase;
  private readonly dbPath: string;
  private databasePromise: Promise<SqliteDatabaseAdapter> | null = null;

  constructor(options: SqlitePlaylistVideoCatalogOptions = {}) {
    this.createDatabase = options.createDatabase ?? createMigratedPrimarySqliteDatabase;
    this.dbPath = options.dbPath ?? getPrimaryStorageConfig().databasePath;
  }

  private async getDatabase(): Promise<SqliteDatabaseAdapter> {
    if (!this.databasePromise) {
      this.databasePromise = this.createDatabase({ dbPath: this.dbPath });
    }

    return this.databasePromise;
  }

  async findById(videoId: string, scope: VideoReadAccessScope) {
    const database = await this.getDatabase();
    const video = await findReadyVideoById(database, videoId, scope);

    if (!video) {
      return null;
    }

    return {
      duration: video.duration,
      id: video.id,
      thumbnailUrl: `/api/thumbnail/${video.id}`,
      title: video.title,
    };
  }

  async getPlaylistVideos(items: PlaylistItem[], scope: VideoReadAccessScope) {
    const database = await this.getDatabase();
    const resolvedVideos = await Promise.all(items.map(async (item) => {
      const video = await findReadyVideoById(database, item.videoId, scope);

      if (!video) {
        return null;
      }

      return {
        duration: video.duration,
        id: video.id,
        episodeMetadata: item.episodeMetadata,
        position: item.position,
        thumbnailUrl: `/api/thumbnail/${video.id}`,
        title: video.title,
      } satisfies {
        duration: number;
        id: string;
        position: number;
        thumbnailUrl?: string;
        title: string;
        episodeMetadata?: PlaylistItem['episodeMetadata'];
      };
    }));

    return resolvedVideos.filter(video => video !== null);
  }
}

async function findReadyVideoById(
  database: SqliteDatabaseAdapter,
  videoId: string,
  scope: VideoReadAccessScope,
) {
  const accessWhereClause = scope.type === 'public_only'
    ? 'videos.visibility = \'public\''
    : '(videos.visibility = \'public\' OR videos.owner_id = ?)';
  const statement = database.prepare<PlaylistVideoRow>(`
    SELECT
      videos.id,
      videos.title,
      videos.duration_seconds
    FROM videos
    INNER JOIN video_media_assets
      ON video_media_assets.video_id = videos.id
     AND video_media_assets.status = 'ready'
    WHERE videos.id = ? AND ${accessWhereClause}
  `);
  const row = scope.type === 'public_only'
    ? await statement.get(videoId)
    : await statement.get(videoId, scope.ownerId);

  return row
    ? {
        duration: row.duration_seconds,
        id: row.id,
        title: row.title,
      }
    : null;
}
