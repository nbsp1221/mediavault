import { promises as fsPromises } from 'fs';
import { readFileSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import crypto from 'node:crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { backfillBrowserCompatiblePlayback } from '~/modules/playback/infrastructure/backfill/browser-compatible-playback-backfill';
import * as ThumbnailCryptoUtils from '~/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils';

const VALID_JPEG_BUFFER = readFileSync(join(process.cwd(), 'public', 'images', 'video-placeholder.jpg'));

function createApp2JpegVariant(): Buffer {
  const mutated = Buffer.from(VALID_JPEG_BUFFER);
  const app0MarkerIndex = mutated.indexOf(Buffer.from([0xFF, 0xE0]));

  if (app0MarkerIndex === -1) {
    throw new Error('failed to locate APP0 marker in JPEG fixture');
  }

  mutated[app0MarkerIndex + 1] = 0xE2;
  Buffer.from('APP2META\0', 'latin1').copy(mutated, app0MarkerIndex + 6);
  return mutated;
}

async function seedStagedPlaybackPackage(input: {
  includeAudioSegments?: boolean;
  includeInitSegments?: boolean;
  includeVideoSegments?: boolean;
  key: Buffer | string;
  manifest: string;
  stagingDir: string;
}): Promise<void> {
  await mkdir(join(input.stagingDir, 'video'), { recursive: true });
  await mkdir(join(input.stagingDir, 'audio'), { recursive: true });
  await writeFile(join(input.stagingDir, 'manifest.mpd'), input.manifest);
  await writeFile(join(input.stagingDir, 'key.bin'), input.key);

  if (input.includeInitSegments !== false) {
    await writeFile(join(input.stagingDir, 'video', 'init.mp4'), 'video-init');
    await writeFile(join(input.stagingDir, 'audio', 'init.mp4'), 'audio-init');
  }

  if (input.includeVideoSegments !== false) {
    await writeFile(join(input.stagingDir, 'video', 'segment-0001.m4s'), 'new-video-segment');
  }

  if (input.includeAudioSegments !== false) {
    await writeFile(join(input.stagingDir, 'audio', 'segment-0001.m4s'), 'new-audio-segment');
  }
}

describe('backfillBrowserCompatiblePlayback', () => {
  const tempDirs: string[] = [];
  const originalVideoMasterSeed = process.env.VIDEO_MASTER_ENCRYPTION_SEED;

  beforeAll(() => {
    process.env.VIDEO_MASTER_ENCRYPTION_SEED = 'browser-backfill-test-master-seed';
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.map(dir => rm(dir, { force: true, recursive: true })));
    tempDirs.length = 0;
  });

  afterAll(() => {
    if (originalVideoMasterSeed === undefined) {
      delete process.env.VIDEO_MASTER_ENCRYPTION_SEED;
      return;
    }

    process.env.VIDEO_MASTER_ENCRYPTION_SEED = originalVideoMasterSeed;
  });

  it('rebuilds HEVC-only manifests in a temporary workspace and promotes the browser-compatible package in place', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'browser-backfill-'));
    tempDirs.push(rootDir);

    const videosDir = join(rootDir, 'videos');
    const targetVideoId = 'video-hevc-only';
    const targetDir = join(videosDir, targetVideoId);

    await mkdir(join(targetDir, 'video'), { recursive: true });
    await mkdir(join(targetDir, 'audio'), { recursive: true });
    await writeFile(join(targetDir, 'video.mp4'), 'source-binary');
    await writeFile(join(targetDir, 'manifest.mpd'), '<Representation id="0" codecs="hev1.1.6.H120.90" />');
    await writeFile(join(targetDir, 'video', 'segment-0001.m4s'), 'old-video-segment');
    await writeFile(join(targetDir, 'audio', 'segment-0001.m4s'), 'old-audio-segment');

    const result = await backfillBrowserCompatiblePlayback({
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      createPackage: async (request) => {
        const stagedKeyId = crypto.createHash('sha256').update(request.videoId).digest().subarray(0, 16).toString('hex');
        await seedStagedPlaybackPackage({
          key: 'new-clearkey',
          stagingDir: request.stagingDir,
          manifest: `<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" cenc:default_KID="${stagedKeyId}" /><Representation id="0" codecs="avc1.640028" />`,
        });
      },
      videoIds: [targetVideoId],
      videosDir,
    });

    expect(result.rebuilt).toEqual([targetVideoId]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
    const promotedManifest = await readFile(join(targetDir, 'manifest.mpd'), 'utf8');
    const canonicalKeyId = crypto.createHash('sha256').update(targetVideoId).digest().subarray(0, 16).toString('hex');

    expect(promotedManifest).toContain('avc1.640028');
    expect(promotedManifest).toContain(`default_KID="${canonicalKeyId}"`);
    await expect(readFile(join(targetDir, 'video', 'segment-0001.m4s'), 'utf8')).resolves.toBe('new-video-segment');
    await expect(readFile(join(targetDir, 'audio', 'segment-0001.m4s'), 'utf8')).resolves.toBe('new-audio-segment');
    await expect(readFile(join(targetDir, 'key.bin'), 'utf8')).resolves.toBe('new-clearkey');
    await expect(readFile(join(targetDir, 'video.mp4'), 'utf8')).resolves.toBe('source-binary');
  });

  it('fails explicitly requested fixture IDs when the original source file is missing', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'browser-backfill-'));
    tempDirs.push(rootDir);

    const videosDir = join(rootDir, 'videos');
    const targetVideoId = 'video-without-source';
    const targetDir = join(videosDir, targetVideoId);

    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, 'manifest.mpd'), '<Representation id="0" codecs="hev1.1.6.H120.90" />');

    const result = await backfillBrowserCompatiblePlayback({
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      createPackage: async () => {
        throw new Error('should not run without a source file');
      },
      videoIds: [targetVideoId],
      videosDir,
    });

    expect(result.rebuilt).toEqual([]);
    expect(result.failed).toEqual([
      {
        error: 'original source file is missing',
        videoId: targetVideoId,
      },
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('fails explicitly requested fixture IDs when the manifest is missing', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'browser-backfill-'));
    tempDirs.push(rootDir);

    const videosDir = join(rootDir, 'videos');
    const targetVideoId = 'video-without-manifest';
    const targetDir = join(videosDir, targetVideoId);

    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, 'video.mp4'), 'source-binary');

    const result = await backfillBrowserCompatiblePlayback({
      createPackage: async () => {
        throw new Error('should not run without a manifest');
      },
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      videoIds: [targetVideoId],
      videosDir,
    });

    expect(result.rebuilt).toEqual([]);
    expect(result.failed).toEqual([
      {
        error: 'manifest.mpd not found',
        videoId: targetVideoId,
      },
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('rebuilds manifests whose video codec is already AVC when the canonical default_KID is still wrong', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'browser-backfill-'));
    tempDirs.push(rootDir);

    const videosDir = join(rootDir, 'videos');
    const targetVideoId = 'video-with-wrong-kid';
    const targetDir = join(videosDir, targetVideoId);

    await mkdir(join(targetDir, 'video'), { recursive: true });
    await mkdir(join(targetDir, 'audio'), { recursive: true });
    await writeFile(join(targetDir, 'video.mp4'), 'source-binary');
    await writeFile(
      join(targetDir, 'manifest.mpd'),
      '<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" cenc:default_KID="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" /><Representation id="0" codecs="avc1.640028" />',
    );

    const result = await backfillBrowserCompatiblePlayback({
      createPackage: async (request) => {
        const canonicalKeyId = crypto.createHash('sha256').update(request.videoId).digest().subarray(0, 16).toString('hex');
        await seedStagedPlaybackPackage({
          key: 'canonical-key',
          manifest: `<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" cenc:default_KID="${canonicalKeyId}" /><Representation id="0" codecs="avc1.640028" />`,
          stagingDir: request.stagingDir,
        });
      },
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      videoIds: [targetVideoId],
      videosDir,
    });

    expect(result.rebuilt).toEqual([targetVideoId]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('fails the rebuild when the staged package omits a required core asset', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'browser-backfill-'));
    tempDirs.push(rootDir);

    const videosDir = join(rootDir, 'videos');
    const targetVideoId = 'video-with-missing-staged-key';
    const targetDir = join(videosDir, targetVideoId);

    await mkdir(join(targetDir, 'video'), { recursive: true });
    await mkdir(join(targetDir, 'audio'), { recursive: true });
    await writeFile(join(targetDir, 'video.mp4'), 'source-binary');
    await writeFile(join(targetDir, 'key.bin'), 'old-key');
    await writeFile(join(targetDir, 'manifest.mpd'), '<Representation id="0" codecs="hev1.1.6.H120.90" />');

    const result = await backfillBrowserCompatiblePlayback({
      createPackage: async (request) => {
        await mkdir(join(request.stagingDir, 'video'), { recursive: true });
        await mkdir(join(request.stagingDir, 'audio'), { recursive: true });
        await writeFile(join(request.stagingDir, 'manifest.mpd'), '<Representation id="0" codecs="avc1.640028" />');
      },
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      videoIds: [targetVideoId],
      videosDir,
    });

    expect(result.rebuilt).toEqual([]);
    expect(result.failed).toEqual([
      {
        error: 'missing staged asset: key.bin',
        videoId: targetVideoId,
      },
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
    await expect(readFile(join(targetDir, 'manifest.mpd'), 'utf8')).resolves.toContain('hev1.1.6.H120.90');
    await expect(readFile(join(targetDir, 'key.bin'), 'utf8')).resolves.toBe('old-key');
  });

  it('fails the rebuild when staged stream directories do not contain media segments', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'browser-backfill-'));
    tempDirs.push(rootDir);

    const videosDir = join(rootDir, 'videos');
    const targetVideoId = 'video-empty-streams';
    const targetDir = join(videosDir, targetVideoId);

    await mkdir(join(targetDir, 'video'), { recursive: true });
    await mkdir(join(targetDir, 'audio'), { recursive: true });
    await writeFile(join(targetDir, 'video.mp4'), 'source-binary');
    await writeFile(join(targetDir, 'key.bin'), 'old-key');
    await writeFile(join(targetDir, 'manifest.mpd'), '<Representation id="0" codecs="hev1.1.6.H120.90" />');

    const result = await backfillBrowserCompatiblePlayback({
      createPackage: async (request) => {
        await seedStagedPlaybackPackage({
          includeAudioSegments: false,
          includeVideoSegments: false,
          key: 'new-key',
          manifest: '<Representation id="0" codecs="avc1.640028" />',
          stagingDir: request.stagingDir,
        });
      },
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      videoIds: [targetVideoId],
      videosDir,
    });

    expect(result.rebuilt).toEqual([]);
    expect(result.failed).toEqual([
      {
        error: 'missing staged media segments: audio',
        videoId: targetVideoId,
      },
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('fails safely when rollback snapshot capture hits a non-missing I/O error', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'browser-backfill-'));
    tempDirs.push(rootDir);

    const videosDir = join(rootDir, 'videos');
    const targetVideoId = 'video-with-rollback-io-failure';
    const targetDir = join(videosDir, targetVideoId);

    await mkdir(join(targetDir, 'video'), { recursive: true });
    await mkdir(join(targetDir, 'audio'), { recursive: true });
    await writeFile(join(targetDir, 'video.mp4'), 'source-binary');
    await writeFile(join(targetDir, 'key.bin'), 'old-key');
    await writeFile(join(targetDir, 'manifest.mpd'), '<Representation id="0" codecs="hev1.1.6.H120.90" />');
    await writeFile(join(targetDir, 'video', 'segment-0001.m4s'), 'old-video-segment');
    await writeFile(join(targetDir, 'audio', 'segment-0001.m4s'), 'old-audio-segment');

    const originalCopyFile = fsPromises.copyFile.bind(fsPromises);
    const copyFileSpy = vi.spyOn(fsPromises, 'copyFile');
    copyFileSpy.mockImplementation(async (sourcePath, destinationPath, mode) => {
      if (
        String(sourcePath).endsWith(`/videos/${targetVideoId}/key.bin`) &&
        String(destinationPath).includes(`.browser-backfill-rollback-${targetVideoId}-`)
      ) {
        const error = new Error('EACCES: simulated rollback capture failure') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      }

      return originalCopyFile(sourcePath, destinationPath, mode);
    });

    const result = await backfillBrowserCompatiblePlayback({
      createPackage: async (request) => {
        await seedStagedPlaybackPackage({
          key: 'new-key',
          manifest: '<Representation id="0" codecs="avc1.640028" />',
          stagingDir: request.stagingDir,
        });
      },
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      videoIds: [targetVideoId],
      videosDir,
    });

    expect(result.rebuilt).toEqual([]);
    expect(result.failed).toEqual([
      {
        error: expect.stringContaining('EACCES'),
        videoId: targetVideoId,
      },
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
    await expect(readFile(join(targetDir, 'manifest.mpd'), 'utf8')).resolves.toContain('hev1.1.6.H120.90');
    await expect(readFile(join(targetDir, 'key.bin'), 'utf8')).resolves.toBe('old-key');
    await expect(readFile(join(targetDir, 'video', 'segment-0001.m4s'), 'utf8')).resolves.toBe('old-video-segment');
    await expect(readFile(join(targetDir, 'audio', 'segment-0001.m4s'), 'utf8')).resolves.toBe('old-audio-segment');
  });

  it('rebuilds AVC manifests when the stored encryption key is not the canonical video key', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'browser-backfill-'));
    tempDirs.push(rootDir);

    const videosDir = join(rootDir, 'videos');
    const targetVideoId = 'video-with-wrong-key';
    const targetDir = join(videosDir, targetVideoId);
    const canonicalKeyId = crypto.createHash('sha256').update(targetVideoId).digest().subarray(0, 16).toString('hex');

    await mkdir(join(targetDir, 'video'), { recursive: true });
    await mkdir(join(targetDir, 'audio'), { recursive: true });
    await writeFile(join(targetDir, 'video.mp4'), 'source-binary');
    await writeFile(join(targetDir, 'key.bin'), Buffer.from('ffeeddccbbaa99887766554433221100', 'hex'));
    await writeFile(
      join(targetDir, 'manifest.mpd'),
      `<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" cenc:default_KID="${canonicalKeyId}" /><Representation id="0" codecs="avc1.640028" />`,
    );

    const result = await backfillBrowserCompatiblePlayback({
      createPackage: async (request) => {
        await seedStagedPlaybackPackage({
          key: 'canonical-key',
          manifest: `<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" cenc:default_KID="${canonicalKeyId}" /><Representation id="0" codecs="avc1.640028" />`,
          stagingDir: request.stagingDir,
        });
      },
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      videoIds: [targetVideoId],
      videosDir,
    });

    expect(result.rebuilt).toEqual([targetVideoId]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('preserves thumbnail decryptability for explicitly rebuilt fixtures', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'browser-backfill-'));
    tempDirs.push(rootDir);

    const videosDir = join(rootDir, 'videos');
    const targetVideoId = 'video-with-encrypted-thumbnail';
    const targetDir = join(videosDir, targetVideoId);
    const originalKey = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const replacementKey = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex');
    const originalThumbnail = VALID_JPEG_BUFFER;
    const encryptedThumbnail = ThumbnailCryptoUtils.encryptThumbnailEnvelope({
      imageData: originalThumbnail,
      key: originalKey,
      videoId: targetVideoId,
    });

    await mkdir(join(targetDir, 'video'), { recursive: true });
    await mkdir(join(targetDir, 'audio'), { recursive: true });
    await writeFile(join(targetDir, 'video.mp4'), 'source-binary');
    await writeFile(join(targetDir, 'key.bin'), originalKey);
    await writeFile(join(targetDir, 'thumbnail.jpg'), encryptedThumbnail);
    await writeFile(join(targetDir, 'manifest.mpd'), '<Representation id="0" codecs="hev1.1.6.H120.90" />');

    const result = await backfillBrowserCompatiblePlayback({
      createPackage: async (request) => {
        const canonicalKeyId = crypto.createHash('sha256').update(request.videoId).digest().subarray(0, 16).toString('hex');
        await seedStagedPlaybackPackage({
          key: replacementKey,
          manifest: `<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" cenc:default_KID="${canonicalKeyId}" /><Representation id="0" codecs="avc1.640028" />`,
          stagingDir: request.stagingDir,
        });
      },
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      videoIds: [targetVideoId],
      videosDir,
    });

    expect(result.rebuilt).toEqual([targetVideoId]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);

    const promotedThumbnail = await readFile(join(targetDir, 'thumbnail.jpg'));
    const promotedKey = await readFile(join(targetDir, 'key.bin'));
    const decryptedThumbnail = ThumbnailCryptoUtils.decryptThumbnailEnvelope({
      encryptedBuffer: promotedThumbnail,
      key: promotedKey,
      videoId: targetVideoId,
    });

    expect(decryptedThumbnail).toEqual(originalThumbnail);
  });

  it('keeps the rebuilt playback package even when thumbnail recovery fails after promotion starts', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'browser-backfill-'));
    tempDirs.push(rootDir);

    const videosDir = join(rootDir, 'videos');
    const targetVideoId = 'video-with-unrecoverable-thumbnail';
    const targetDir = join(videosDir, targetVideoId);
    const oldKey = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const newKey = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex');
    const foreignKey = Buffer.from('1234567890abcdef1234567890abcdef', 'hex');
    const encryptedThumbnail = ThumbnailCryptoUtils.encryptThumbnailEnvelope({
      imageData: Buffer.from('thumbnail-payload'),
      key: foreignKey,
      videoId: targetVideoId,
    });

    await mkdir(join(targetDir, 'video'), { recursive: true });
    await mkdir(join(targetDir, 'audio'), { recursive: true });
    await writeFile(join(targetDir, 'video.mp4'), 'source-binary');
    await writeFile(join(targetDir, 'key.bin'), oldKey);
    await writeFile(join(targetDir, 'thumbnail.jpg'), encryptedThumbnail);
    await writeFile(join(targetDir, 'manifest.mpd'), '<Representation id="0" codecs="hev1.1.6.H120.90" />');
    await writeFile(join(targetDir, 'video', 'segment-0001.m4s'), 'old-video-segment');
    await writeFile(join(targetDir, 'audio', 'segment-0001.m4s'), 'old-audio-segment');

    const result = await backfillBrowserCompatiblePlayback({
      createPackage: async (request) => {
        await seedStagedPlaybackPackage({
          key: newKey,
          manifest: '<Representation id="0" codecs="avc1.640028" />',
          stagingDir: request.stagingDir,
        });
      },
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      videoIds: [targetVideoId],
      videosDir,
    });

    expect(result.rebuilt).toEqual([targetVideoId]);
    expect(result.failed).toEqual([]);
    expect(result.warnings).toEqual([
      {
        warning: `Encrypted thumbnail for ${targetVideoId} cannot be re-keyed after backfill.`,
        videoId: targetVideoId,
      },
    ]);
    expect(result.skipped).toEqual([]);
    await expect(readFile(join(targetDir, 'manifest.mpd'), 'utf8')).resolves.toContain('avc1.640028');
    await expect(readFile(join(targetDir, 'key.bin'))).resolves.toEqual(newKey);
    await expect(readFile(join(targetDir, 'video', 'segment-0001.m4s'), 'utf8')).resolves.toBe('new-video-segment');
    await expect(readFile(join(targetDir, 'audio', 'segment-0001.m4s'), 'utf8')).resolves.toBe('new-audio-segment');
  });

  it('re-keys valid non-JFIF JPEG thumbnails during backfill', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'browser-backfill-'));
    tempDirs.push(rootDir);

    const videosDir = join(rootDir, 'videos');
    const targetVideoId = 'video-with-app2-thumbnail';
    const targetDir = join(videosDir, targetVideoId);
    const originalKey = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const replacementKey = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex');
    const originalThumbnail = createApp2JpegVariant();
    const encryptedThumbnail = ThumbnailCryptoUtils.encryptThumbnailEnvelope({
      imageData: originalThumbnail,
      key: originalKey,
      videoId: targetVideoId,
    });

    await mkdir(join(targetDir, 'video'), { recursive: true });
    await mkdir(join(targetDir, 'audio'), { recursive: true });
    await writeFile(join(targetDir, 'video.mp4'), 'source-binary');
    await writeFile(join(targetDir, 'key.bin'), originalKey);
    await writeFile(join(targetDir, 'thumbnail.jpg'), encryptedThumbnail);
    await writeFile(join(targetDir, 'manifest.mpd'), '<Representation id="0" codecs="hev1.1.6.H120.90" />');

    const result = await backfillBrowserCompatiblePlayback({
      createPackage: async (request) => {
        const canonicalKeyId = crypto.createHash('sha256').update(request.videoId).digest().subarray(0, 16).toString('hex');
        await seedStagedPlaybackPackage({
          key: replacementKey,
          manifest: `<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" cenc:default_KID="${canonicalKeyId}" /><Representation id="0" codecs="avc1.640028" />`,
          stagingDir: request.stagingDir,
        });
      },
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      videoIds: [targetVideoId],
      videosDir,
    });

    expect(result.rebuilt).toEqual([targetVideoId]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);

    const promotedThumbnail = await readFile(join(targetDir, 'thumbnail.jpg'));
    const promotedKey = await readFile(join(targetDir, 'key.bin'));
    const decryptedThumbnail = ThumbnailCryptoUtils.decryptThumbnailEnvelope({
      encryptedBuffer: promotedThumbnail,
      key: promotedKey,
      videoId: targetVideoId,
    });

    expect(decryptedThumbnail).toEqual(originalThumbnail);
  });

  it('rejects malformed JPEG-like plaintext during thumbnail recovery and reports a warning instead of a false success', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'browser-backfill-'));
    tempDirs.push(rootDir);

    const videosDir = join(rootDir, 'videos');
    const targetVideoId = 'video-with-malformed-jpeg-thumbnail';
    const targetDir = join(videosDir, targetVideoId);
    const replacementKey = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex');
    const malformedThumbnail = Buffer.from('ffd8ffe00002ffdaffd9', 'hex');
    const encryptedThumbnail = ThumbnailCryptoUtils.encryptThumbnailEnvelope({
      imageData: malformedThumbnail,
      key: replacementKey,
      videoId: targetVideoId,
    });

    await mkdir(join(targetDir, 'video'), { recursive: true });
    await mkdir(join(targetDir, 'audio'), { recursive: true });
    await writeFile(join(targetDir, 'video.mp4'), 'source-binary');
    await writeFile(join(targetDir, 'key.bin'), replacementKey);
    await writeFile(join(targetDir, 'thumbnail.jpg'), encryptedThumbnail);
    await writeFile(join(targetDir, 'manifest.mpd'), '<Representation id="0" codecs="hev1.1.6.H120.90" />');

    const result = await backfillBrowserCompatiblePlayback({
      createPackage: async (request) => {
        const canonicalKeyId = crypto.createHash('sha256').update(request.videoId).digest().subarray(0, 16).toString('hex');
        await seedStagedPlaybackPackage({
          key: replacementKey,
          manifest: `<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" cenc:default_KID="${canonicalKeyId}" /><Representation id="0" codecs="avc1.640028" />`,
          stagingDir: request.stagingDir,
        });
      },
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      videoIds: [targetVideoId],
      videosDir,
    });

    expect(result.rebuilt).toEqual([targetVideoId]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([
      {
        warning: `Encrypted thumbnail for ${targetVideoId} cannot be re-keyed after backfill.`,
        videoId: targetVideoId,
      },
    ]);
  });
});
