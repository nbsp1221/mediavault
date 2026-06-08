#!/usr/bin/env bun
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createPrimarySqliteDatabase } from '../app/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { getPrimaryStorageConfig } from '../app/shared/config/app-config.server';

interface IntegrityFinding {
  code: string;
  message: string;
  path?: string;
  severity: 'blocking' | 'warning';
  videoId?: string;
}

interface ReadyAssetRow {
  audio_init_relpath: string | null;
  audio_segment_glob: string | null;
  key_relpath: string | null;
  manifest_relpath: string | null;
  thumbnail_relpath: string | null;
  video_id: string;
  video_init_relpath: string | null;
  video_segment_glob: string | null;
}

interface UploadRow {
  committed_video_id: string | null;
  expires_at: string;
  staging_id: string;
  status: string;
  storage_relpath: string;
}

interface VideoRow {
  id: string;
  owner_id: string | null;
  visibility: string | null;
}

function collectGlobMatches(baseDir: string, globValue: string | null): string[] {
  if (!globValue) {
    return [];
  }

  const absolutePatternPath = resolveReadyMediaRelpath({
    baseDir,
    relpath: globValue,
  });

  if (!absolutePatternPath) {
    return [];
  }

  const directory = path.dirname(absolutePatternPath);
  const basenamePattern = path.basename(globValue);

  if (!existsSync(directory)) {
    return [];
  }

  const [prefix, suffix = ''] = basenamePattern.split('*');
  return readdirSync(directory)
    .filter(entry => entry.startsWith(prefix) && entry.endsWith(suffix))
    .map(entry => path.join(directory, entry));
}

function resolveReadyMediaRelpath(input: {
  baseDir: string;
  relpath: string;
}): string | null {
  const absolutePath = path.resolve(input.baseDir, input.relpath);
  const baseDirWithSeparator = input.baseDir.endsWith(path.sep)
    ? input.baseDir
    : `${input.baseDir}${path.sep}`;

  if (absolutePath === input.baseDir || !absolutePath.startsWith(baseDirWithSeparator)) {
    return null;
  }

  return absolutePath;
}

function findSymlinkPathInsideBase(input: {
  absolutePath: string;
  baseDir: string;
}): string | null {
  const relativePath = path.relative(input.baseDir, input.absolutePath);
  const parts = relativePath.split(path.sep).filter(Boolean);
  let currentPath = input.baseDir;

  for (const part of parts) {
    currentPath = path.join(currentPath, part);

    if (!existsSync(currentPath)) {
      continue;
    }

    if (lstatSync(currentPath).isSymbolicLink()) {
      return currentPath;
    }
  }

  return null;
}

function assertNoSymlinkPathComponent(input: {
  absolutePath: string;
  baseDir: string;
  findings: IntegrityFinding[];
  message: string;
  videoId: string;
}): boolean {
  const symlinkPath = findSymlinkPathInsideBase({
    absolutePath: input.absolutePath,
    baseDir: input.baseDir,
  });

  if (!symlinkPath) {
    return true;
  }

  input.findings.push({
    code: 'unsafe_symlink',
    message: input.message,
    path: symlinkPath,
    severity: 'blocking',
    videoId: input.videoId,
  });

  return false;
}

function assertRelativeFile(input: {
  code: string;
  findings: IntegrityFinding[];
  relpath: string | null;
  baseDir: string;
  videoId: string;
}) {
  if (!input.relpath) {
    input.findings.push({
      code: input.code,
      message: `Ready media asset is missing ${input.code}`,
      severity: 'blocking',
      videoId: input.videoId,
    });
    return;
  }

  const absolutePath = resolveReadyMediaRelpath({
    baseDir: input.baseDir,
    relpath: input.relpath,
  });

  if (!absolutePath) {
    input.findings.push({
      code: 'unsafe_ready_media_path',
      message: `Ready media path escapes canonical videos directory: ${input.relpath}`,
      severity: 'blocking',
      videoId: input.videoId,
    });
    return;
  }

  if (!existsSync(absolutePath)) {
    input.findings.push({
      code: input.code,
      message: `Missing ready media file: ${input.relpath}`,
      path: absolutePath,
      severity: 'blocking',
      videoId: input.videoId,
    });
    return;
  }

  if (!assertNoSymlinkPathComponent({
    absolutePath,
    baseDir: input.baseDir,
    findings: input.findings,
    message: `Ready media path contains a symlink component: ${input.relpath}`,
    videoId: input.videoId,
  })) {
    return;
  }

  const stat = lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    input.findings.push({
      code: 'unsafe_symlink',
      message: `Media file must not be a symlink: ${input.relpath}`,
      path: absolutePath,
      severity: 'blocking',
      videoId: input.videoId,
    });
  }
}

function resolveStorageRelpath(input: {
  findings: IntegrityFinding[];
  relpath: string;
  storageDir: string;
}): string | null {
  const absolutePath = path.resolve(input.storageDir, input.relpath);
  const storageDirWithSeparator = input.storageDir.endsWith(path.sep)
    ? input.storageDir
    : `${input.storageDir}${path.sep}`;

  if (absolutePath !== input.storageDir && !absolutePath.startsWith(storageDirWithSeparator)) {
    input.findings.push({
      code: 'unsafe_upload_storage_path',
      message: `Upload storage path escapes primary storage: ${input.relpath}`,
      path: absolutePath,
      severity: 'blocking',
    });
    return null;
  }

  return absolutePath;
}

function assertSegmentGlob(input: {
  code: string;
  findings: IntegrityFinding[];
  globValue: string | null;
  baseDir: string;
  videoId: string;
}) {
  if (input.globValue && !resolveReadyMediaRelpath({
    baseDir: input.baseDir,
    relpath: input.globValue,
  })) {
    input.findings.push({
      code: 'unsafe_ready_media_path',
      message: `Ready media segment glob escapes canonical videos directory: ${input.globValue}`,
      severity: 'blocking',
      videoId: input.videoId,
    });
    return;
  }

  const absolutePatternPath = input.globValue
    ? resolveReadyMediaRelpath({
        baseDir: input.baseDir,
        relpath: input.globValue,
      })
    : null;
  const segmentDirectory = absolutePatternPath
    ? path.dirname(absolutePatternPath)
    : null;

  if (segmentDirectory && existsSync(segmentDirectory) && !assertNoSymlinkPathComponent({
    absolutePath: segmentDirectory,
    baseDir: input.baseDir,
    findings: input.findings,
    message: `Ready media segment directory contains a symlink component: ${input.globValue}`,
    videoId: input.videoId,
  })) {
    return;
  }

  const matches = collectGlobMatches(input.baseDir, input.globValue);
  if (matches.length === 0) {
    input.findings.push({
      code: input.code,
      message: `Missing media segments for ${input.videoId}`,
      severity: 'blocking',
      videoId: input.videoId,
    });
    return;
  }

  for (const match of matches) {
    if (!assertNoSymlinkPathComponent({
      absolutePath: match,
      baseDir: input.baseDir,
      findings: input.findings,
      message: `Ready media segment path contains a symlink component: ${path.relative(input.baseDir, match)}`,
      videoId: input.videoId,
    })) {
      continue;
    }

    const stat = lstatSync(match);
    if (stat.isSymbolicLink()) {
      input.findings.push({
        code: 'unsafe_symlink',
        message: `Media segment must not be a symlink: ${path.relative(input.baseDir, match)}`,
        path: match,
        severity: 'blocking',
        videoId: input.videoId,
      });
    }
  }
}

export async function verifyPrimaryStorageIntegrity() {
  const config = getPrimaryStorageConfig();
  const findings: IntegrityFinding[] = [];

  if (!existsSync(config.databasePath)) {
    findings.push({
      code: 'missing_primary_database',
      message: `Primary SQLite database does not exist: ${config.databasePath}`,
      path: config.databasePath,
      severity: 'blocking',
    });

    return {
      checkedAt: new Date().toISOString(),
      databasePath: config.databasePath,
      findings,
      ok: false,
      storageRoot: config.storageDir,
    };
  }

  const databaseStat = lstatSync(config.databasePath);
  if (databaseStat.isSymbolicLink() || !databaseStat.isFile()) {
    findings.push({
      code: databaseStat.isSymbolicLink() ? 'unsafe_symlink' : 'invalid_primary_database',
      message: `Primary SQLite database must be a regular non-symlink file: ${config.databasePath}`,
      path: config.databasePath,
      severity: 'blocking',
    });

    return {
      checkedAt: new Date().toISOString(),
      databasePath: config.databasePath,
      findings,
      ok: false,
      storageRoot: config.storageDir,
    };
  }

  const database = await createPrimarySqliteDatabase({
    dbPath: config.databasePath,
  });

  const integrityRow = await database.prepare<{ integrity_check: string }>('PRAGMA integrity_check').get();
  if (integrityRow?.integrity_check !== 'ok') {
    findings.push({
      code: 'sqlite_integrity_check_failed',
      message: `SQLite integrity_check returned ${integrityRow?.integrity_check ?? 'no result'}`,
      severity: 'blocking',
    });
  }

  const foreignKeyRows = await database.prepare<{ table: string }>('PRAGMA foreign_key_check').all();
  for (const row of foreignKeyRows) {
    findings.push({
      code: 'sqlite_foreign_key_check_failed',
      message: `SQLite foreign_key_check reported a violation in ${row.table}`,
      severity: 'blocking',
    });
  }

  const readyAssets = await database.prepare<ReadyAssetRow>(`
    SELECT
      video_id,
      manifest_relpath,
      key_relpath,
      thumbnail_relpath,
      video_init_relpath,
      video_segment_glob,
      audio_init_relpath,
      audio_segment_glob
    FROM video_media_assets
    WHERE status = 'ready'
    ORDER BY video_id ASC
  `).all();

  for (const asset of readyAssets) {
    assertRelativeFile({
      code: 'missing_manifest',
      findings,
      relpath: asset.manifest_relpath,
      baseDir: config.videosDir,
      videoId: asset.video_id,
    });
    assertRelativeFile({
      code: 'missing_key',
      findings,
      relpath: asset.key_relpath,
      baseDir: config.videosDir,
      videoId: asset.video_id,
    });
    assertRelativeFile({
      code: 'missing_thumbnail',
      findings,
      relpath: asset.thumbnail_relpath,
      baseDir: config.videosDir,
      videoId: asset.video_id,
    });
    assertRelativeFile({
      code: 'missing_video_init',
      findings,
      relpath: asset.video_init_relpath,
      baseDir: config.videosDir,
      videoId: asset.video_id,
    });
    assertRelativeFile({
      code: 'missing_audio_init',
      findings,
      relpath: asset.audio_init_relpath,
      baseDir: config.videosDir,
      videoId: asset.video_id,
    });

    assertSegmentGlob({
      code: 'missing_video_segments',
      findings,
      globValue: asset.video_segment_glob,
      baseDir: config.videosDir,
      videoId: asset.video_id,
    });

    assertSegmentGlob({
      code: 'missing_audio_segments',
      findings,
      globValue: asset.audio_segment_glob,
      baseDir: config.videosDir,
      videoId: asset.video_id,
    });
  }

  const uploads = await database.prepare<UploadRow>(`
    SELECT staging_id, status, committed_video_id, storage_relpath, expires_at
    FROM ingest_uploads
    ORDER BY staging_id ASC
  `).all();
  const now = Date.now();

  for (const upload of uploads) {
    if (upload.status === 'committed' && !upload.committed_video_id) {
      findings.push({
        code: 'committed_upload_missing_video',
        message: `Committed upload ${upload.staging_id} has no committed video id`,
        severity: 'blocking',
      });
    }

    if (Date.parse(upload.expires_at) <= now) {
      findings.push({
        code: 'expired_staged_upload',
        message: `Staged upload is expired: ${upload.staging_id}`,
        severity: 'warning',
      });
    }

    if (!['committed', 'expired'].includes(upload.status)) {
      const uploadPath = resolveStorageRelpath({
        findings,
        relpath: upload.storage_relpath,
        storageDir: config.storageDir,
      });

      if (!uploadPath) {
        continue;
      }

      if (!existsSync(uploadPath)) {
        findings.push({
          code: 'missing_staged_upload_source',
          message: `Active staged upload source is missing: ${upload.staging_id}`,
          path: uploadPath,
          severity: 'blocking',
        });
        continue;
      }

      const uploadStat = lstatSync(uploadPath);
      if (uploadStat.isSymbolicLink() || !uploadStat.isFile()) {
        findings.push({
          code: uploadStat.isSymbolicLink() ? 'unsafe_symlink' : 'invalid_staged_upload_source',
          message: `Active staged upload source must be a regular non-symlink file: ${upload.staging_id}`,
          path: uploadPath,
          severity: 'blocking',
        });
      }
    }
  }

  const videoRows = await database.prepare<VideoRow>(`
    SELECT id, owner_id, visibility
    FROM videos
    ORDER BY id ASC
  `).all();
  const knownVideoIds = new Set(videoRows.map(row => row.id));

  for (const video of videoRows) {
    if (!video.owner_id?.trim()) {
      findings.push({
        code: 'video_missing_owner',
        message: `Video has no owner: ${video.id}`,
        severity: 'blocking',
        videoId: video.id,
      });
    }

    if (video.visibility !== 'private' && video.visibility !== 'public') {
      findings.push({
        code: 'video_invalid_visibility',
        message: `Video has invalid visibility: ${video.id}`,
        severity: 'blocking',
        videoId: video.id,
      });
    }
  }

  const videosWithoutReadyAssets = await database.prepare<{ id: string }>(`
    SELECT videos.id
    FROM videos
    LEFT JOIN video_media_assets
      ON video_media_assets.video_id = videos.id
      AND video_media_assets.status = 'ready'
    WHERE video_media_assets.video_id IS NULL
    ORDER BY videos.id ASC
  `).all();

  for (const row of videosWithoutReadyAssets) {
    findings.push({
      code: 'video_missing_ready_media_asset',
      message: `Video has no ready media asset row: ${row.id}`,
      severity: 'blocking',
      videoId: row.id,
    });
  }

  if (existsSync(config.videosDir)) {
    for (const entry of readdirSync(config.videosDir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        findings.push({
          code: 'unsafe_symlink',
          message: `Video directory entry must not be a symlink: ${entry.name}`,
          path: path.join(config.videosDir, entry.name),
          severity: 'blocking',
        });
      }
      else if (entry.isDirectory() && !knownVideoIds.has(entry.name)) {
        findings.push({
          code: 'orphan_video_directory',
          message: `Video directory has no database row: ${entry.name}`,
          path: path.join(config.videosDir, entry.name),
          severity: 'warning',
          videoId: entry.name,
        });
      }
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    databasePath: config.databasePath,
    findings,
    ok: findings.every(finding => finding.severity !== 'blocking'),
    storageRoot: config.storageDir,
  };
}

if (import.meta.main) {
  const report = await verifyPrimaryStorageIntegrity();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
