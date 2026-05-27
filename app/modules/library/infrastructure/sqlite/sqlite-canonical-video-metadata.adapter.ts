import type { IngestVideoMetadataWriterPort } from '~/modules/ingest/application/ports/ingest-video-metadata-writer.port';
import type { LibraryVideoReadPort } from '~/modules/library/application/ports/library-video-read.port';
import type { LibraryVideoSourcePort } from '~/modules/library/application/ports/library-video-source.port';
import { getPrimaryStorageConfig } from '~/modules/storage/infrastructure/config/storage-config.server';
import { createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { SqliteLibraryVideoMetadataRepository } from './sqlite-library-video-metadata.repository';

type SqliteCanonicalVideoMetadataAdapterRepository = Pick<
  SqliteLibraryVideoMetadataRepository,
  'create' | 'delete' | 'findAllByReadAccessScope' | 'findByIdByReadAccessScope' | 'listActiveContentTypes' | 'listActiveGenres'
>;

interface SqliteCanonicalVideoMetadataAdapterDependencies {
  dbPath?: string;
  repository?: SqliteCanonicalVideoMetadataAdapterRepository;
}

export class SqliteCanonicalVideoMetadataAdapter
implements LibraryVideoSourcePort, LibraryVideoReadPort, IngestVideoMetadataWriterPort {
  private readonly dbPath: string;
  private readonly shouldWriteMediaAsset: boolean;
  private readonly repository: SqliteCanonicalVideoMetadataAdapterRepository;

  constructor(deps: SqliteCanonicalVideoMetadataAdapterDependencies = {}) {
    this.dbPath = deps.dbPath ?? getPrimaryStorageConfig().databasePath;
    this.shouldWriteMediaAsset = !deps.repository;
    this.repository = deps.repository ?? new SqliteLibraryVideoMetadataRepository({
      dbPath: this.dbPath,
    });
  }

  async listLibraryVideos(scope: Parameters<LibraryVideoSourcePort['listLibraryVideos']>[0]) {
    return this.repository.findAllByReadAccessScope(scope);
  }

  async findLibraryVideoById(
    videoId: Parameters<LibraryVideoReadPort['findLibraryVideoById']>[0],
    scope: Parameters<LibraryVideoReadPort['findLibraryVideoById']>[1],
  ) {
    return this.repository.findByIdByReadAccessScope(videoId, scope);
  }

  async listActiveContentTypes() {
    return this.repository.listActiveContentTypes();
  }

  async listActiveGenres() {
    return this.repository.listActiveGenres();
  }

  async writeVideoRecord(record: Parameters<IngestVideoMetadataWriterPort['writeVideoRecord']>[0]) {
    let createdVideoRecord = false;

    try {
      await this.repository.create({
        contentTypeSlug: record.contentTypeSlug,
        description: record.description,
        duration: record.duration,
        genreSlugs: record.genreSlugs,
        id: record.id,
        ownerId: record.ownerId,
        tags: record.tags,
        thumbnailUrl: record.thumbnailUrl,
        title: record.title,
        videoUrl: record.videoUrl,
        visibility: record.visibility,
      });
      createdVideoRecord = true;
      if (this.shouldWriteMediaAsset) {
        await this.writeReadyMediaAsset(record.id);
      }
    }
    catch (error) {
      if (createdVideoRecord) {
        await this.repository.delete(record.id);
      }
      throw error;
    }
  }

  async deleteVideoRecord(id: string) {
    await this.repository.delete(id);
  }

  private async writeReadyMediaAsset(videoId: string) {
    const database = await createMigratedPrimarySqliteDatabase({
      dbPath: this.dbPath,
    });

    await database.prepare(`
      INSERT INTO video_media_assets (
        video_id,
        layout_version,
        status,
        preparation_strategy,
        manifest_relpath,
        key_relpath,
        thumbnail_relpath,
        video_init_relpath,
        video_segment_glob,
        audio_init_relpath,
        audio_segment_glob,
        prepared_at
      ) VALUES (?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(video_id) DO UPDATE SET
        layout_version = excluded.layout_version,
        status = excluded.status,
        preparation_strategy = excluded.preparation_strategy,
        manifest_relpath = excluded.manifest_relpath,
        key_relpath = excluded.key_relpath,
        thumbnail_relpath = excluded.thumbnail_relpath,
        video_init_relpath = excluded.video_init_relpath,
        video_segment_glob = excluded.video_segment_glob,
        audio_init_relpath = excluded.audio_init_relpath,
        audio_segment_glob = excluded.audio_segment_glob,
        prepared_at = excluded.prepared_at,
        failed_at = NULL,
        failure_message = NULL
    `).run(
      videoId,
      1,
      'ingest',
      `${videoId}/manifest.mpd`,
      `${videoId}/key.bin`,
      `${videoId}/thumbnail.jpg`,
      `${videoId}/video/init.mp4`,
      `${videoId}/video/segment-*.m4s`,
      `${videoId}/audio/init.mp4`,
      `${videoId}/audio/segment-*.m4s`,
      new Date().toISOString(),
    );
  }
}
