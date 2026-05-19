import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createMigratedPrimarySqliteDatabase } from '../../../app/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { verifyPrimaryStorageIntegrity } from '../../../scripts/verify-data-integrity';

const ORIGINAL_STORAGE_DIR = process.env.MEDIAVAULT_STORAGE_DIR;
const workspaces: string[] = [];

function createWorkspace() {
  const workspace = mkdtempSync(path.join(tmpdir(), 'local-streamer-integrity-'));
  workspaces.push(workspace);
  return workspace;
}

function writeReadyMediaFiles(storageDir: string, videoId: string) {
  const videoDir = path.join(storageDir, 'videos', videoId);

  mkdirSync(path.join(videoDir, 'audio'), { recursive: true });
  mkdirSync(path.join(videoDir, 'video'), { recursive: true });

  writeFileSync(path.join(videoDir, 'manifest.mpd'), '<MPD />');
  writeFileSync(path.join(videoDir, 'key.bin'), 'key');
  writeFileSync(path.join(videoDir, 'thumbnail.jpg'), 'thumbnail');
  writeFileSync(path.join(videoDir, 'audio', 'init.mp4'), 'audio init');
  writeFileSync(path.join(videoDir, 'audio', 'segment-0001.m4s'), 'audio segment');
  writeFileSync(path.join(videoDir, 'video', 'init.mp4'), 'video init');
  writeFileSync(path.join(videoDir, 'video', 'segment-0001.m4s'), 'video segment');
}

beforeEach(() => {
  delete process.env.MEDIAVAULT_STORAGE_DIR;
});

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { force: true, recursive: true });
  }

  if (ORIGINAL_STORAGE_DIR === undefined) {
    delete process.env.MEDIAVAULT_STORAGE_DIR;
  }
  else {
    process.env.MEDIAVAULT_STORAGE_DIR = ORIGINAL_STORAGE_DIR;
  }
});

describe('primary storage integrity verification', () => {
  test('reports a missing primary database without creating a new one', async () => {
    const workspace = createWorkspace();
    const storageDir = path.join(workspace, 'storage');
    const databasePath = path.join(storageDir, 'db.sqlite');

    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;

    const report = await verifyPrimaryStorageIntegrity();

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'missing_primary_database',
      path: databasePath,
      severity: 'blocking',
    }));
    expect(existsSync(databasePath)).toBe(false);
  });

  test('checks ready media asset paths relative to the canonical videos directory', async () => {
    const workspace = createWorkspace();
    const storageDir = path.join(workspace, 'storage');
    const databasePath = path.join(storageDir, 'db.sqlite');
    const videoId = 'integrity-video-1';

    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;

    const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
    const now = new Date('2026-04-28T00:00:00.000Z').toISOString();

    await database.prepare(`
      INSERT INTO videos (id, title, description, duration_seconds, content_type_slug, created_at, updated_at, sort_index)
      VALUES (?, ?, NULL, ?, NULL, ?, ?, ?)
    `).run(videoId, 'Integrity Video', 1, now, now, 1);
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
      ) VALUES (?, 'ready', 1, 'fixture', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      videoId,
      `${videoId}/manifest.mpd`,
      `${videoId}/key.bin`,
      `${videoId}/thumbnail.jpg`,
      `${videoId}/video/init.mp4`,
      `${videoId}/video/segment-*.m4s`,
      `${videoId}/audio/init.mp4`,
      `${videoId}/audio/segment-*.m4s`,
      now,
    );
    writeReadyMediaFiles(storageDir, videoId);

    const report = await verifyPrimaryStorageIntegrity();

    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
  });

  test('reports a blocking finding when a video has no ready media asset row', async () => {
    const workspace = createWorkspace();
    const storageDir = path.join(workspace, 'storage');
    const databasePath = path.join(storageDir, 'db.sqlite');
    const videoId = 'missing-asset-video';

    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;

    const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
    const now = new Date('2026-04-28T00:00:00.000Z').toISOString();

    await database.prepare(`
      INSERT INTO videos (id, title, description, duration_seconds, content_type_slug, created_at, updated_at, sort_index)
      VALUES (?, ?, NULL, ?, NULL, ?, ?, ?)
    `).run(videoId, 'Missing Asset Video', 1, now, now, 1);

    const report = await verifyPrimaryStorageIntegrity();

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'video_missing_ready_media_asset',
      severity: 'blocking',
      videoId,
    }));
  });

  test('reports a blocking finding when a ready media path escapes the videos directory', async () => {
    const workspace = createWorkspace();
    const storageDir = path.join(workspace, 'storage');
    const databasePath = path.join(storageDir, 'db.sqlite');
    const videoId = 'escaped-ready-media-video';

    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;

    const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
    const now = new Date('2026-04-28T00:00:00.000Z').toISOString();

    await database.prepare(`
      INSERT INTO videos (id, title, description, duration_seconds, content_type_slug, created_at, updated_at, sort_index)
      VALUES (?, ?, NULL, ?, NULL, ?, ?, ?)
    `).run(videoId, 'Escaped Ready Media Video', 1, now, now, 1);
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
      ) VALUES (?, 'preparing', 1, 'fixture', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
    `).run(videoId);

    await database.exec('PRAGMA ignore_check_constraints = ON');
    await database.prepare(`
      UPDATE video_media_assets
      SET
        status = 'ready',
        manifest_relpath = ?,
        key_relpath = ?,
        thumbnail_relpath = ?,
        video_init_relpath = ?,
        video_segment_glob = ?,
        audio_init_relpath = ?,
        audio_segment_glob = ?,
        prepared_at = ?
      WHERE video_id = ?
    `).run(
      `${videoId}/manifest.mpd`,
      `${videoId}/key.bin`,
      `${videoId}/thumbnail.jpg`,
      `${videoId}/video/init.mp4`,
      `${videoId}/video/segment-*.m4s`,
      '../outside/init.mp4',
      `${videoId}/audio/segment-*.m4s`,
      now,
      videoId,
    );
    await database.exec('PRAGMA ignore_check_constraints = OFF');
    writeReadyMediaFiles(storageDir, videoId);
    mkdirSync(path.join(storageDir, 'outside'), { recursive: true });
    writeFileSync(path.join(storageDir, 'outside', 'init.mp4'), 'escaped init');

    const report = await verifyPrimaryStorageIntegrity();

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'unsafe_ready_media_path',
      severity: 'blocking',
      videoId,
    }));
  });

  test('reports a blocking finding when a ready media segment glob escapes the videos directory', async () => {
    const workspace = createWorkspace();
    const storageDir = path.join(workspace, 'storage');
    const databasePath = path.join(storageDir, 'db.sqlite');
    const videoId = 'escaped-segment-glob-video';

    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;

    const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
    const now = new Date('2026-04-28T00:00:00.000Z').toISOString();

    await database.prepare(`
      INSERT INTO videos (id, title, description, duration_seconds, content_type_slug, created_at, updated_at, sort_index)
      VALUES (?, ?, NULL, ?, NULL, ?, ?, ?)
    `).run(videoId, 'Escaped Segment Glob Video', 1, now, now, 1);
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
      ) VALUES (?, 'preparing', 1, 'fixture', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
    `).run(videoId);

    await database.exec('PRAGMA ignore_check_constraints = ON');
    await database.prepare(`
      UPDATE video_media_assets
      SET
        status = 'ready',
        manifest_relpath = ?,
        key_relpath = ?,
        thumbnail_relpath = ?,
        video_init_relpath = ?,
        video_segment_glob = ?,
        audio_init_relpath = ?,
        audio_segment_glob = ?,
        prepared_at = ?
      WHERE video_id = ?
    `).run(
      `${videoId}/manifest.mpd`,
      `${videoId}/key.bin`,
      `${videoId}/thumbnail.jpg`,
      `${videoId}/video/init.mp4`,
      '../outside/segment-*.m4s',
      `${videoId}/audio/init.mp4`,
      `${videoId}/audio/segment-*.m4s`,
      now,
      videoId,
    );
    await database.exec('PRAGMA ignore_check_constraints = OFF');
    writeReadyMediaFiles(storageDir, videoId);
    mkdirSync(path.join(storageDir, 'outside'), { recursive: true });
    writeFileSync(path.join(storageDir, 'outside', 'segment-0001.m4s'), 'escaped segment');

    const report = await verifyPrimaryStorageIntegrity();

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'unsafe_ready_media_path',
      severity: 'blocking',
      videoId,
    }));
  });

  test('reports a blocking finding when a ready media directory is a symlink', async () => {
    const workspace = createWorkspace();
    const storageDir = path.join(workspace, 'storage');
    const databasePath = path.join(storageDir, 'db.sqlite');
    const videoId = 'symlink-directory-video';

    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;

    const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
    const now = new Date('2026-04-28T00:00:00.000Z').toISOString();

    await database.prepare(`
      INSERT INTO videos (id, title, description, duration_seconds, content_type_slug, created_at, updated_at, sort_index)
      VALUES (?, ?, NULL, ?, NULL, ?, ?, ?)
    `).run(videoId, 'Symlink Directory Video', 1, now, now, 1);
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
      ) VALUES (?, 'ready', 1, 'fixture', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      videoId,
      `${videoId}/manifest.mpd`,
      `${videoId}/key.bin`,
      `${videoId}/thumbnail.jpg`,
      `${videoId}/video/init.mp4`,
      `${videoId}/video/segment-*.m4s`,
      `${videoId}/audio/init.mp4`,
      `${videoId}/audio/segment-*.m4s`,
      now,
    );
    writeReadyMediaFiles(storageDir, videoId);

    const outsideVideoDir = path.join(storageDir, 'outside-video-dir');
    mkdirSync(outsideVideoDir, { recursive: true });
    writeFileSync(path.join(outsideVideoDir, 'init.mp4'), 'outside init');
    writeFileSync(path.join(outsideVideoDir, 'segment-0001.m4s'), 'outside segment');
    rmSync(path.join(storageDir, 'videos', videoId, 'video'), { recursive: true });
    symlinkSync(outsideVideoDir, path.join(storageDir, 'videos', videoId, 'video'));

    const report = await verifyPrimaryStorageIntegrity();

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'unsafe_symlink',
      severity: 'blocking',
      videoId,
    }));
  });

  test('reports a blocking finding when only a segment glob directory is a symlink', async () => {
    const workspace = createWorkspace();
    const storageDir = path.join(workspace, 'storage');
    const databasePath = path.join(storageDir, 'db.sqlite');
    const videoId = 'symlink-glob-directory-video';

    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;

    const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
    const now = new Date('2026-04-28T00:00:00.000Z').toISOString();

    await database.prepare(`
      INSERT INTO videos (id, title, description, duration_seconds, content_type_slug, created_at, updated_at, sort_index)
      VALUES (?, ?, NULL, ?, NULL, ?, ?, ?)
    `).run(videoId, 'Symlink Glob Directory Video', 1, now, now, 1);
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
      ) VALUES (?, 'ready', 1, 'fixture', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      videoId,
      `${videoId}/manifest.mpd`,
      `${videoId}/key.bin`,
      `${videoId}/thumbnail.jpg`,
      `${videoId}/video/init.mp4`,
      `${videoId}/video-link/segment-*.m4s`,
      `${videoId}/audio/init.mp4`,
      `${videoId}/audio/segment-*.m4s`,
      now,
    );
    writeReadyMediaFiles(storageDir, videoId);

    const outsideSegmentDir = path.join(storageDir, 'outside-segment-dir');
    mkdirSync(outsideSegmentDir, { recursive: true });
    writeFileSync(path.join(outsideSegmentDir, 'segment-0001.m4s'), 'outside segment');
    symlinkSync(outsideSegmentDir, path.join(storageDir, 'videos', videoId, 'video-link'));

    const report = await verifyPrimaryStorageIntegrity();

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'unsafe_symlink',
      severity: 'blocking',
      videoId,
    }));
  });

  test('reports a blocking finding when a matched segment is a symlink', async () => {
    const workspace = createWorkspace();
    const storageDir = path.join(workspace, 'storage');
    const databasePath = path.join(storageDir, 'db.sqlite');
    const videoId = 'symlink-segment-video';

    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;

    const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
    const now = new Date('2026-04-28T00:00:00.000Z').toISOString();

    await database.prepare(`
      INSERT INTO videos (id, title, description, duration_seconds, content_type_slug, created_at, updated_at, sort_index)
      VALUES (?, ?, NULL, ?, NULL, ?, ?, ?)
    `).run(videoId, 'Symlink Segment Video', 1, now, now, 1);
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
      ) VALUES (?, 'ready', 1, 'fixture', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      videoId,
      `${videoId}/manifest.mpd`,
      `${videoId}/key.bin`,
      `${videoId}/thumbnail.jpg`,
      `${videoId}/video/init.mp4`,
      `${videoId}/video/segment-*.m4s`,
      `${videoId}/audio/init.mp4`,
      `${videoId}/audio/segment-*.m4s`,
      now,
    );
    writeReadyMediaFiles(storageDir, videoId);
    rmSync(path.join(storageDir, 'videos', videoId, 'video', 'segment-0001.m4s'));
    symlinkSync(
      path.join(storageDir, 'videos', videoId, 'audio', 'segment-0001.m4s'),
      path.join(storageDir, 'videos', videoId, 'video', 'segment-0001.m4s'),
    );

    const report = await verifyPrimaryStorageIntegrity();

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'unsafe_symlink',
      severity: 'blocking',
      videoId,
    }));
  });

  test('reports expired staged uploads without blocking otherwise healthy storage', async () => {
    const workspace = createWorkspace();
    const storageDir = path.join(workspace, 'storage');
    const databasePath = path.join(storageDir, 'db.sqlite');

    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;

    const database = await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
    const now = new Date('2026-04-28T00:00:00.000Z').toISOString();

    await database.prepare(`
      INSERT INTO ingest_uploads (
        staging_id,
        filename,
        mime_type,
        size_bytes,
        storage_relpath,
        status,
        created_at,
        updated_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'expired-stage',
      'upload.mp4',
      'video/mp4',
      1,
      'staging/expired-stage/source',
      'expired',
      now,
      now,
      new Date('2026-04-27T00:00:00.000Z').toISOString(),
    );

    const report = await verifyPrimaryStorageIntegrity();

    expect(report.ok).toBe(true);
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'expired_staged_upload',
      severity: 'warning',
    }));
  });
});
