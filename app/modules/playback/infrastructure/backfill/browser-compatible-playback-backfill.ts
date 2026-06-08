import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename } from 'node:path';
import path from 'node:path';
import type { MediaKeyDerivationConfig } from '~/shared/config/app-config.server';
import { normalizeClearKeyManifest } from '~/modules/ingest/infrastructure/processing/normalize-clearkey-manifest';
import {
  decryptThumbnailEnvelope,
  encryptThumbnailEnvelope,
  looksLikeJpeg,
  validateEncryptedFormat,
} from '~/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils';
import { getMediaKeyDerivationConfig, getMediaPackagingConfig } from '~/shared/config/app-config.server';
import { getStoragePaths } from '~/shared/config/app-config.server';
import { getShakaPackagerPath } from '~/shared/config/video-tools.server';
import { executeFFmpegCommand } from '~/shared/lib/server/ffmpeg-process-manager.server';
import { derivePlaybackEncryptionKey } from '../license/derive-playback-encryption-key';
import { generatePlaybackKeyId } from '../license/generate-playback-key-id';

const HEVC_ONLY_PATTERN = /<Representation\b[^>]*codecs="(?:hev1|hvc1)[^"]*"/i;
const AVC_PATTERN = /<Representation\b[^>]*codecs="avc1[^"]*"/i;
const SOURCE_FILE_PATTERN = /^video\.[a-z0-9]+$/i;
const PROMOTED_PATHS = ['audio', 'video', 'manifest.mpd', 'key.bin'] as const;
const THUMBNAIL_FILENAME = 'thumbnail.jpg';

interface BackfillLogger {
  error: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
}

interface BackfillSkippedItem {
  reason: 'already-compatible' | 'manifest-missing' | 'missing-source';
  videoId: string;
}

interface BackfillFailedItem {
  error: string;
  videoId: string;
}

interface BackfillWarningItem {
  videoId: string;
  warning: string;
}

export interface BrowserCompatiblePlaybackBackfillSummary {
  failed: BackfillFailedItem[];
  rebuilt: string[];
  skipped: BackfillSkippedItem[];
  warnings: BackfillWarningItem[];
}

interface ExistingThumbnailSnapshot {
  data: Buffer;
  key: Buffer | null;
}

interface CreatePackageInput {
  sourcePath: string;
  stagingDir: string;
  videoId: string;
}

interface BrowserCompatiblePackageInput extends CreatePackageInput {
  mediaKeyConfig: MediaKeyDerivationConfig;
  segmentDuration: number;
}

interface BackfillDependencies {
  createPackage?: (input: CreatePackageInput) => Promise<void>;
  logger?: BackfillLogger;
  mediaKeyConfig?: MediaKeyDerivationConfig;
  segmentDuration?: number;
  videoIds?: string[];
  videosDir?: string;
}

interface BrowserCompatiblePlaybackBackfillCliInput {
  argv?: string[];
  runBackfill?: (input?: BackfillDependencies) => Promise<BrowserCompatiblePlaybackBackfillSummary>;
}

interface StagingWorkspace {
  audioDir: string;
  intermediatePath: string;
  keyPath: string;
  manifestPath: string;
  rootDir: string;
  videoDir: string;
}

export async function backfillBrowserCompatiblePlayback(
  input: BackfillDependencies = {},
): Promise<BrowserCompatiblePlaybackBackfillSummary> {
  const logger = input.logger ?? console;
  const mediaKeyConfig = input.mediaKeyConfig ?? getMediaKeyDerivationConfig();
  const segmentDuration = input.segmentDuration ?? getMediaPackagingConfig().segmentDuration;
  const requiresExplicitFixtures = Boolean(input.videoIds && input.videoIds.length > 0);
  const videosDir = input.videosDir ?? getStoragePaths().videosDir;
  const createPackage = input.createPackage ?? ((packageInput: CreatePackageInput) => createBrowserCompatiblePlaybackPackage({
    ...packageInput,
    mediaKeyConfig,
    segmentDuration,
  }));
  const videoIds = input.videoIds ?? await listVideoIds(videosDir);
  const summary: BrowserCompatiblePlaybackBackfillSummary = {
    failed: [],
    rebuilt: [],
    skipped: [],
    warnings: [],
  };

  for (const videoId of videoIds) {
    const targetDir = path.join(videosDir, videoId);
    const manifestPath = path.join(targetDir, 'manifest.mpd');
    const manifest = await readManifest(manifestPath);

    if (manifest === null) {
      if (requiresExplicitFixtures) {
        summary.failed.push({ error: 'manifest.mpd not found', videoId });
        logger.error(`[browser-backfill] Required fixture ${videoId} is missing manifest.mpd.`);
      }
      else {
        summary.skipped.push({ reason: 'manifest-missing', videoId });
        logger.warn(`[browser-backfill] Skipping ${videoId}: manifest.mpd not found.`);
      }
      continue;
    }

    if (!(await shouldBackfillVideo({
      manifest,
      mediaKeyConfig,
      targetDir,
      videoId,
    }))) {
      summary.skipped.push({ reason: 'already-compatible', videoId });
      logger.info(`[browser-backfill] Skipping ${videoId}: manifest already exposes a browser-compatible video representation with canonical ClearKey identity.`);
      continue;
    }

    const sourcePath = await findVideoSourcePath(targetDir);
    if (!sourcePath) {
      if (requiresExplicitFixtures) {
        summary.failed.push({ error: 'original source file is missing', videoId });
        logger.error(`[browser-backfill] Required fixture ${videoId} is missing the original source file.`);
      }
      else {
        summary.skipped.push({ reason: 'missing-source', videoId });
        logger.warn(`[browser-backfill] Skipping ${videoId}: original source file is missing.`);
      }
      continue;
    }

    const stagedDir = path.join(videosDir, `.browser-backfill-${videoId}-${randomUUID()}`);
    const rollbackDir = path.join(videosDir, `.browser-backfill-rollback-${videoId}-${randomUUID()}`);
    const existingThumbnail = await snapshotExistingThumbnail(targetDir);
    let rollbackPrepared = false;
    let rebuildCompleted = false;

    try {
      try {
        await createPackage({
          sourcePath,
          stagingDir: stagedDir,
          videoId,
        });

        await ensureRequiredStagedAssets(stagedDir);
        await captureRollbackAssets(targetDir, rollbackDir);
        rollbackPrepared = true;
        await promotePackagedAssets(stagedDir, targetDir);
        summary.rebuilt.push(videoId);
        rebuildCompleted = true;
        logger.info(`[browser-backfill] Rebuilt ${videoId} from ${basename(sourcePath)}.`);
      }
      catch (error) {
        if (rollbackPrepared) {
          await restorePromotedAssets(rollbackDir, targetDir);
        }

        const message = error instanceof Error ? error.message : 'Unknown backfill failure';
        summary.failed.push({ error: message, videoId });
        logger.error(`[browser-backfill] Failed to rebuild ${videoId}: ${message}`);
      }

      if (rebuildCompleted) {
        try {
          await reconcileThumbnailEncryption({
            logger,
            previous: existingThumbnail,
            targetDir,
            videoId,
          });
        }
        catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown thumbnail recovery failure';
          summary.warnings.push({ videoId, warning: message });
          logger.warn(`[browser-backfill] Rebuilt ${videoId}, but thumbnail recovery failed: ${message}`);
        }
      }
    }
    finally {
      await fs.rm(stagedDir, { force: true, recursive: true });
      await fs.rm(rollbackDir, { force: true, recursive: true });
    }
  }

  return summary;
}

export function parseBrowserCompatiblePlaybackBackfillArgs(argv: string[]): BackfillDependencies {
  const videoIds: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--video-id') {
      continue;
    }

    const value = argv[index + 1];
    if (!value) {
      continue;
    }

    videoIds.push(value);
    index += 1;
  }

  return {
    videoIds: videoIds.length > 0 ? videoIds : undefined,
  };
}

export async function runBrowserCompatiblePlaybackBackfillCli(
  input: BrowserCompatiblePlaybackBackfillCliInput = {},
): Promise<BrowserCompatiblePlaybackBackfillSummary> {
  const runBackfill = input.runBackfill ?? backfillBrowserCompatiblePlayback;
  return await runBackfill(parseBrowserCompatiblePlaybackBackfillArgs(input.argv ?? process.argv.slice(2)));
}

if (import.meta.main) {
  const summary = await runBrowserCompatiblePlaybackBackfillCli();

  if (summary.failed.length > 0) {
    process.exitCode = 1;
  }
}

export function isHevcOnlyManifest(manifest: string): boolean {
  return HEVC_ONLY_PATTERN.test(manifest) && !AVC_PATTERN.test(manifest);
}

export function shouldBackfillManifest(manifest: string, videoId: string): boolean {
  if (isHevcOnlyManifest(manifest)) {
    return true;
  }

  const keyIdMatch = manifest.match(/default_KID="([^"]+)"/i);
  if (!keyIdMatch) {
    return true;
  }

  return keyIdMatch[1].replaceAll('-', '').toLowerCase() !== generatePlaybackKeyId(videoId).toLowerCase();
}

async function shouldBackfillVideo(input: {
  manifest: string;
  mediaKeyConfig: MediaKeyDerivationConfig;
  targetDir: string;
  videoId: string;
}): Promise<boolean> {
  if (shouldBackfillManifest(input.manifest, input.videoId)) {
    return true;
  }

  const storedKey = await readStoredKey(input.targetDir);
  if (!storedKey) {
    return true;
  }

  const canonicalKey = derivePlaybackEncryptionKey({
    config: input.mediaKeyConfig,
    videoId: input.videoId,
  });

  return !storedKey.equals(canonicalKey);
}

async function createBrowserCompatiblePlaybackPackage(input: BrowserCompatiblePackageInput): Promise<void> {
  const workspace = resolveStagingWorkspace(input.stagingDir);
  const key = derivePlaybackEncryptionKey({
    config: input.mediaKeyConfig,
    videoId: input.videoId,
  });

  await fs.mkdir(workspace.videoDir, { recursive: true });
  await fs.mkdir(workspace.audioDir, { recursive: true });
  await fs.writeFile(workspace.keyPath, key);

  await executeFFmpegCommand({
    args: buildFfmpegArgs({
      inputPath: input.sourcePath,
      outputPath: workspace.intermediatePath,
    }),
    command: 'ffmpeg',
  });

  await executeFFmpegCommand({
    args: buildPackagerArgs({
      inputPath: workspace.intermediatePath,
      key,
      keyId: generatePlaybackKeyId(input.videoId),
      manifestPath: workspace.manifestPath,
      outputDir: workspace.rootDir,
      segmentDuration: input.segmentDuration,
    }),
    command: getShakaPackagerPath(),
  });

  await normalizeManifest(workspace.manifestPath);
  await fs.rm(workspace.intermediatePath, { force: true });
}

function resolveStagingWorkspace(rootDir: string): StagingWorkspace {
  return {
    audioDir: path.join(rootDir, 'audio'),
    intermediatePath: path.join(rootDir, 'intermediate.mp4'),
    keyPath: path.join(rootDir, 'key.bin'),
    manifestPath: path.join(rootDir, 'manifest.mpd'),
    rootDir,
    videoDir: path.join(rootDir, 'video'),
  };
}

function buildFfmpegArgs(input: {
  inputPath: string;
  outputPath: string;
}): string[] {
  return [
    '-i',
    input.inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c:v',
    'libx264',
    '-crf',
    '20',
    '-preset',
    'slow',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-ar',
    '44100',
    '-profile:v',
    'high',
    '-level',
    '4.1',
    '-pix_fmt',
    'yuv420p',
    '-f',
    'mp4',
    '-movflags',
    '+faststart',
    '-y',
    input.outputPath,
  ];
}

function buildPackagerArgs(input: {
  inputPath: string;
  key: Buffer;
  keyId: string;
  manifestPath: string;
  outputDir: string;
  segmentDuration: number;
}): string[] {
  return [
    [
      `in=${input.inputPath}`,
      'stream=video',
      `init_segment=${path.join(input.outputDir, 'video', 'init.mp4')}`,
      `segment_template=${path.join(input.outputDir, 'video', 'segment-$Number%04d$.m4s')}`,
      'drm_label=CENC',
    ].join(','),
    [
      `in=${input.inputPath}`,
      'stream=audio',
      `init_segment=${path.join(input.outputDir, 'audio', 'init.mp4')}`,
      `segment_template=${path.join(input.outputDir, 'audio', 'segment-$Number%04d$.m4s')}`,
      'drm_label=CENC',
    ].join(','),
    '--enable_raw_key_encryption',
    '--protection_scheme',
    'cenc',
    '--keys',
    `label=CENC:key_id=${input.keyId}:key=${input.key.toString('hex')}`,
    '--generate_static_live_mpd',
    '--mpd_output',
    input.manifestPath,
    '--segment_duration',
    String(input.segmentDuration),
  ];
}

async function normalizeManifest(manifestPath: string) {
  const manifest = await fs.readFile(manifestPath, 'utf8');
  const normalizedManifest = normalizeClearKeyManifest(manifest);

  if (normalizedManifest !== manifest) {
    await fs.writeFile(manifestPath, normalizedManifest);
  }
}

async function readManifest(manifestPath: string): Promise<string | null> {
  try {
    return await fs.readFile(manifestPath, 'utf8');
  }
  catch {
    return null;
  }
}

async function listVideoIds(videosDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(videosDir, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  }
  catch {
    return [];
  }
}

async function findVideoSourcePath(targetDir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const match = entries.find(entry => entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name));
    return match ? path.join(targetDir, match.name) : null;
  }
  catch {
    return null;
  }
}

async function snapshotExistingThumbnail(targetDir: string): Promise<ExistingThumbnailSnapshot | null> {
  const thumbnailPath = path.join(targetDir, THUMBNAIL_FILENAME);

  try {
    const data = await fs.readFile(thumbnailPath);
    const key = await readStoredKey(targetDir);
    return { data, key };
  }
  catch {
    return null;
  }
}

async function reconcileThumbnailEncryption(input: {
  logger: BackfillLogger;
  previous: ExistingThumbnailSnapshot | null;
  targetDir: string;
  videoId: string;
}): Promise<void> {
  const thumbnailPath = path.join(input.targetDir, THUMBNAIL_FILENAME);
  const currentKey = await readStoredKey(input.targetDir);

  if (!currentKey) {
    return;
  }

  let currentThumbnail: Buffer;

  try {
    currentThumbnail = await fs.readFile(thumbnailPath);
  }
  catch {
    return;
  }

  if (!validateEncryptedFormat(currentThumbnail)) {
    return;
  }

  const currentDecryption = tryDecryptThumbnail({
    encryptedThumbnail: currentThumbnail,
    key: currentKey,
    videoId: input.videoId,
  });
  if (currentDecryption && looksLikeJpeg(currentDecryption)) {
    return;
  }

  const previousKey = input.previous?.key;
  if (!previousKey) {
    throw new Error(`Encrypted thumbnail for ${input.videoId} is not decryptable with the promoted key.`);
  }

  const previousThumbnail = tryDecryptThumbnail({
    encryptedThumbnail: currentThumbnail,
    key: previousKey,
    videoId: input.videoId,
  }) ??
  tryDecryptThumbnail({
    encryptedThumbnail: input.previous?.data ?? currentThumbnail,
    key: previousKey,
    videoId: input.videoId,
  });

  if (!previousThumbnail || !looksLikeJpeg(previousThumbnail)) {
    throw new Error(`Encrypted thumbnail for ${input.videoId} cannot be re-keyed after backfill.`);
  }

  const reEncryptedThumbnail = encryptThumbnailEnvelope({
    imageData: previousThumbnail,
    key: currentKey,
    videoId: input.videoId,
  });
  await fs.writeFile(thumbnailPath, reEncryptedThumbnail);
  input.logger.info(`[browser-backfill] Re-keyed encrypted thumbnail for ${input.videoId}.`);
}

function tryDecryptThumbnail(input: {
  encryptedThumbnail: Buffer;
  key: Buffer;
  videoId: string;
}): Buffer | null {
  try {
    return decryptThumbnailEnvelope({
      encryptedBuffer: input.encryptedThumbnail,
      key: input.key,
      videoId: input.videoId,
    });
  }
  catch {
    return null;
  }
}

async function promotePackagedAssets(stagedDir: string, targetDir: string): Promise<void> {
  for (const relativePath of PROMOTED_PATHS) {
    const stagedPath = path.join(stagedDir, relativePath);
    const stats = await fs.stat(stagedPath);
    const targetPath = path.join(targetDir, relativePath);

    await fs.rm(targetPath, { force: true, recursive: true });

    if (stats.isDirectory()) {
      await fs.cp(stagedPath, targetPath, { recursive: true });
    }
    else {
      await fs.copyFile(stagedPath, targetPath);
    }
  }
}

async function ensureRequiredStagedAssets(stagedDir: string): Promise<void> {
  for (const relativePath of ['manifest.mpd', 'key.bin'] as const) {
    try {
      await fs.stat(path.join(stagedDir, relativePath));
    }
    catch {
      throw new Error(`missing staged asset: ${relativePath}`);
    }
  }

  await ensureSegmentedStreamAssets(stagedDir, 'audio');
  await ensureSegmentedStreamAssets(stagedDir, 'video');
}

async function captureRollbackAssets(targetDir: string, rollbackDir: string): Promise<void> {
  await fs.mkdir(rollbackDir, { recursive: true });

  for (const relativePath of PROMOTED_PATHS) {
    const targetPath = path.join(targetDir, relativePath);
    const rollbackPath = path.join(rollbackDir, relativePath);

    try {
      const stats = await fs.stat(targetPath);

      if (stats.isDirectory()) {
        await fs.cp(targetPath, rollbackPath, { recursive: true });
      }
      else {
        await fs.mkdir(path.dirname(rollbackPath), { recursive: true });
        await fs.copyFile(targetPath, rollbackPath);
      }
    }
    catch (error) {
      if (!isMissingFsError(error)) {
        throw error;
      }
    }
  }
}

async function restorePromotedAssets(rollbackDir: string, targetDir: string): Promise<void> {
  for (const relativePath of PROMOTED_PATHS) {
    const targetPath = path.join(targetDir, relativePath);
    const rollbackPath = path.join(rollbackDir, relativePath);

    await fs.rm(targetPath, { force: true, recursive: true });

    try {
      const stats = await fs.stat(rollbackPath);

      if (stats.isDirectory()) {
        await fs.cp(rollbackPath, targetPath, { recursive: true });
      }
      else {
        await fs.copyFile(rollbackPath, targetPath);
      }
    }
    catch (error) {
      if (!isMissingFsError(error)) {
        throw error;
      }
    }
  }
}

async function ensureSegmentedStreamAssets(stagedDir: string, streamDirName: 'audio' | 'video'): Promise<void> {
  const streamDir = path.join(stagedDir, streamDirName);
  let entries: string[];

  try {
    const stats = await fs.stat(streamDir);

    if (!stats.isDirectory()) {
      throw new Error(`missing staged asset: ${streamDirName}`);
    }

    entries = await fs.readdir(streamDir);
  }
  catch {
    throw new Error(`missing staged asset: ${streamDirName}`);
  }

  if (!entries.includes('init.mp4')) {
    throw new Error(`missing staged init segment: ${streamDirName}/init.mp4`);
  }

  if (!entries.some(entry => entry.endsWith('.m4s'))) {
    throw new Error(`missing staged media segments: ${streamDirName}`);
  }
}

async function readStoredKey(targetDir: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(targetDir, 'key.bin'));
  }
  catch {
    return null;
  }
}

function isMissingFsError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as NodeJS.ErrnoException).code === 'string' &&
    (error as NodeJS.ErrnoException).code === 'ENOENT',
  );
}
