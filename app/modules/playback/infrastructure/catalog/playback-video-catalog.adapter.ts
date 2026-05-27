import type { VideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { getPrimaryStorageConfig } from '~/modules/storage/infrastructure/config/storage-config.server';
import { type CreateMigratedPrimarySqliteDatabase, createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import type { VideoCatalogPort } from '../../application/ports/video-catalog.port';

interface PlaybackVideoCatalogRepositoryRecord {
  createdAt: Date;
  description?: string;
  duration: number;
  id: string;
  tags: string[];
  thumbnailUrl?: string;
  title: string;
  videoUrl: string;
}

interface PlaybackVideoCatalogRepository {
  findAll: (scope: VideoReadAccessScope) => Promise<PlaybackVideoCatalogRepositoryRecord[]>;
}

interface PlaybackVideoCatalogAdapterDependencies {
  createDatabase?: CreateMigratedPrimarySqliteDatabase;
  dbPath?: string;
  repository?: PlaybackVideoCatalogRepository;
}

interface PlaybackVideoRow {
  created_at: string;
  description: string | null;
  duration_seconds: number;
  id: string;
  title: string;
}

class PrimaryPlaybackVideoCatalogRepository implements PlaybackVideoCatalogRepository {
  private readonly createDatabase: CreateMigratedPrimarySqliteDatabase;
  private readonly dbPath: string;
  private databasePromise: Promise<SqliteDatabaseAdapter> | null = null;

  constructor(deps: Pick<PlaybackVideoCatalogAdapterDependencies, 'createDatabase' | 'dbPath'> = {}) {
    this.createDatabase = deps.createDatabase ?? createMigratedPrimarySqliteDatabase;
    this.dbPath = deps.dbPath ?? getPrimaryStorageConfig().databasePath;
  }

  private async getDatabase(): Promise<SqliteDatabaseAdapter> {
    if (!this.databasePromise) {
      this.databasePromise = this.createDatabase({ dbPath: this.dbPath });
    }

    return this.databasePromise;
  }

  async findAll(scope: VideoReadAccessScope): Promise<PlaybackVideoCatalogRepositoryRecord[]> {
    const database = await this.getDatabase();
    const accessWhereClause = scope.type === 'public_only'
      ? 'videos.visibility = \'public\''
      : '(videos.visibility = \'public\' OR videos.owner_id = ?)';
    const statement = database.prepare<PlaybackVideoRow>(`
      SELECT
        videos.id,
        videos.title,
        videos.description,
        videos.duration_seconds,
        videos.created_at
      FROM videos
      INNER JOIN video_media_assets
        ON video_media_assets.video_id = videos.id
       AND video_media_assets.status = 'ready'
      WHERE ${accessWhereClause}
      ORDER BY videos.sort_index DESC
    `);
    const rows = scope.type === 'public_only'
      ? await statement.all()
      : await statement.all(scope.ownerId);

    return Promise.all(rows.map(async row => ({
      createdAt: new Date(row.created_at),
      description: row.description ?? undefined,
      duration: row.duration_seconds,
      id: row.id,
      tags: await loadTags(database, row.id),
      thumbnailUrl: `/api/thumbnail/${row.id}`,
      title: row.title,
      videoUrl: `/videos/${row.id}/manifest.mpd`,
    })));
  }
}

export class PlaybackVideoCatalogAdapter implements VideoCatalogPort {
  private readonly repository: PlaybackVideoCatalogRepository;

  constructor(deps: PlaybackVideoCatalogAdapterDependencies = {}) {
    if (deps.repository) {
      this.repository = deps.repository;
      return;
    }

    this.repository = new PrimaryPlaybackVideoCatalogRepository({
      createDatabase: deps.createDatabase,
      dbPath: deps.dbPath,
    });
  }

  async getPlayerVideo(videoId: string, scope: VideoReadAccessScope) {
    const videos = await this.repository.findAll(scope);
    const currentVideo = videos.find(video => video.id === videoId);

    if (!currentVideo) {
      return null;
    }

    return {
      relatedVideos: findRelatedVideos(currentVideo, videos),
      video: currentVideo,
    };
  }
}

async function loadTags(database: SqliteDatabaseAdapter, videoId: string): Promise<string[]> {
  const rows = await database.prepare<{ tag_slug: string }>(`
    SELECT tag_slug
    FROM video_tags
    WHERE video_id = ?
    ORDER BY tag_slug ASC
  `).all(videoId);

  return rows.map(row => row.tag_slug);
}

function findRelatedVideos(
  current: PlaybackVideoCatalogRepositoryRecord,
  allVideos: PlaybackVideoCatalogRepositoryRecord[],
) {
  if (current.tags.length === 0) {
    return [];
  }

  const currentTags = new Set(current.tags.map(tag => tag.toLowerCase()));

  return allVideos
    .filter(candidate => candidate.id !== current.id)
    .filter(candidate => candidate.tags.some(tag => currentTags.has(tag.toLowerCase())))
    .slice(0, 10);
}
