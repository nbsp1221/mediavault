import { normalizeVideoTags } from '~/modules/library/domain/video-tag';
import { normalizeTaxonomySlug, normalizeTaxonomySlugs } from '~/modules/library/domain/video-taxonomy';
import { SqliteLibraryVideoMetadataRepository } from '~/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository';
import { createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { installTestDatabaseEncryptionKey } from './database-encryption-key';

export interface SeedLibraryVideoInput {
  addedAt?: string;
  createdAt?: Date | string;
  description?: string;
  duration: number;
  contentTypeSlug?: string;
  genreSlugs?: string[];
  id: string;
  mediaStatus?: 'none' | 'ready';
  tags?: string[];
  thumbnailUrl?: string;
  title: string;
  videoUrl: string;
}

function resolveCreatedAt(input: Pick<SeedLibraryVideoInput, 'addedAt' | 'createdAt'>) {
  const rawTimestamp = input.createdAt instanceof Date
    ? input.createdAt.toISOString()
    : input.createdAt || input.addedAt;

  return new Date(rawTimestamp || 0);
}

export async function seedLibraryVideoMetadata(
  dbPath: string,
  videos: SeedLibraryVideoInput[],
): Promise<void> {
  installTestDatabaseEncryptionKey();
  const repository = new SqliteLibraryVideoMetadataRepository({ dbPath });
  const database = await createMigratedPrimarySqliteDatabase({ dbPath });
  const existingVideos = await repository.findAll();
  const existingIds = new Set(existingVideos.map(video => video.id));
  let sortIndex = existingVideos.length + videos.length;

  for (const video of videos) {
    if (existingIds.has(video.id)) {
      continue;
    }

    await repository.create({
      createdAt: resolveCreatedAt(video),
      description: video.description,
      duration: video.duration,
      contentTypeSlug: video.contentTypeSlug ? normalizeTaxonomySlug(video.contentTypeSlug) ?? undefined : undefined,
      genreSlugs: normalizeTaxonomySlugs(video.genreSlugs ?? []),
      id: video.id,
      sortIndex,
      tags: normalizeVideoTags(video.tags ?? []),
      thumbnailUrl: video.thumbnailUrl,
      title: video.title,
      videoUrl: video.videoUrl,
    });
    if (video.mediaStatus !== 'none') {
      await database.prepare(`
        INSERT INTO video_media_assets (
          video_id,
          status,
          layout_version,
          preparation_strategy,
          manifest_relpath,
          key_relpath,
          thumbnail_relpath,
          video_init_relpath,
          video_segment_glob,
          audio_init_relpath,
          audio_segment_glob,
          prepared_at
        ) VALUES (?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(video_id) DO NOTHING
      `).run(
        video.id,
        1,
        'fixture',
        `${video.id}/manifest.mpd`,
        `${video.id}/key.bin`,
        `${video.id}/thumbnail.jpg`,
        `${video.id}/video/init.mp4`,
        `${video.id}/video/segment-*.m4s`,
        `${video.id}/audio/init.mp4`,
        `${video.id}/audio/segment-*.m4s`,
        resolveCreatedAt(video).toISOString(),
      );
    }
    sortIndex -= 1;
    existingIds.add(video.id);
  }
}
