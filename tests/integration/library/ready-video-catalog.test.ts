import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SqliteCanonicalVideoMetadataAdapter } from '~/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter';
import { SqliteReadyVideoCatalogAdapter } from '~/modules/library/infrastructure/sqlite/sqlite-ready-video-catalog.adapter';
import { createInitializedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database';
import {
  type SeedLibraryVideoInput,
  seedLibraryVideoMetadata,
} from '../../support/seed-library-video-metadata';

const publicScope = { type: 'public_only' } as const;
const ownerScope = { type: 'public_or_owned', ownerId: 'owner' } as const;

describe('library-owned ready catalog', () => {
  let directory: string;
  let dbPath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'mediavault-ready-catalog-'));
    dbPath = join(directory, 'db.sqlite');
    const videos: Array<
      Pick<SeedLibraryVideoInput, 'id' | 'ownerId' | 'visibility' | 'mediaStatus' | 'tags'>
    > = [
      { id: 'public', ownerId: 'other', visibility: 'public', tags: ['zulu', 'alpha'] },
      { id: 'owned', ownerId: 'owner', visibility: 'private' },
      { id: 'hidden', ownerId: 'other', visibility: 'private' },
      { id: 'metadata-only', ownerId: 'owner', visibility: 'public', mediaStatus: 'none' },
      { id: 'preparing', ownerId: 'owner', visibility: 'public' },
      { id: 'tagless', ownerId: 'owner', visibility: 'public' },
    ];
    await seedLibraryVideoMetadata(
      dbPath,
      videos.map((video) => ({
        ...video,
        createdAt: '2026-05-23T01:02:03.000Z',
        description: 'Catalog fixture',
        duration: 60,
        title: video.id,
        videoUrl: `/videos/${video.id}/manifest.mpd`,
      })),
    );
    const database = await createInitializedPrimarySqliteDatabase({ dbPath });
    await database
      .prepare("UPDATE video_media_assets SET status = 'preparing' WHERE video_id = ?")
      .run('preparing');
    await database.close();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test('applies scope and readiness before listing sorted playback projections', async () => {
    const catalog = new SqliteReadyVideoCatalogAdapter({ dbPath });
    const publicVideos = await catalog.listReadyVideos(publicScope);
    expect(publicVideos.map((video) => video.id)).toEqual(['public', 'tagless']);
    expect(publicVideos[0]).toEqual({
      createdAt: new Date('2026-05-23T01:02:03.000Z'),
      description: 'Catalog fixture',
      duration: 60,
      id: 'public',
      tags: ['alpha', 'zulu'],
      thumbnailUrl: '/api/thumbnail/public',
      title: 'public',
      videoUrl: '/videos/public/manifest.mpd',
    });
    expect(publicVideos[1].tags).toEqual([]);
    expect((await catalog.listReadyVideos(ownerScope)).map((video) => video.id)).toEqual([
      'public',
      'owned',
      'tagless',
    ]);
  });

  test('keeps metadata availability separate from playable availability', async () => {
    const catalog = new SqliteReadyVideoCatalogAdapter({ dbPath });
    const metadata = new SqliteCanonicalVideoMetadataAdapter({ dbPath });
    for (const id of ['metadata-only', 'preparing']) {
      expect(await metadata.findLibraryVideoById(id, publicScope)).toMatchObject({ id });
      expect(await catalog.findReadyVideoById(id, publicScope)).toBeNull();
    }
    for (const id of ['owned', 'hidden', 'missing']) {
      expect(await catalog.findReadyVideoById(id, publicScope)).toBeNull();
    }
    expect(await catalog.findReadyVideoById('hidden', ownerScope)).toBeNull();
    expect(await catalog.findReadyVideoById('owned', ownerScope)).toEqual({
      duration: 60,
      id: 'owned',
      thumbnailUrl: '/api/thumbnail/owned',
      title: 'owned',
    });
  });

  test('retains one summary query and one list plus one tag query per returned video', async () => {
    const database = await createInitializedPrimarySqliteDatabase({ dbPath });
    const queries: string[] = [];
    const createDatabase = vi.fn(async () => ({
      ...database,
      prepare<Row>(sql: string) {
        queries.push(sql);
        return database.prepare<Row>(sql);
      },
    }));
    try {
      const catalog = new SqliteReadyVideoCatalogAdapter({ dbPath, createDatabase });
      await catalog.findReadyVideoById('public', publicScope);
      expect(queries).toHaveLength(1);
      queries.length = 0;
      const videos = await catalog.listReadyVideos(ownerScope);
      expect(queries).toHaveLength(1 + videos.length);
      expect(createDatabase).toHaveBeenCalledTimes(1);
    } finally {
      await database.close();
    }
  });
});
