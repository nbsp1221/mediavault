import crypto from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { decryptThumbnailEnvelope, encryptThumbnailEnvelope } from '~/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils';

describe('browser-compatible playback backfill module', () => {
  let rootDir = '';

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { force: true, recursive: true });
      rootDir = '';
    }
  });

  test('rebuilds an incompatible manifest and re-keys the thumbnail with the canonical playback key', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'browser-backfill-module-'));
    const videosDir = path.join(rootDir, 'videos');
    const videoId = 'video-hevc-only';
    const targetDir = path.join(videosDir, videoId);
    const previousKey = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const originalThumbnail = Buffer.from(await readFile(path.join(process.cwd(), 'public', 'images', 'video-placeholder.jpg')));

    await mkdir(path.join(targetDir, 'video'), { recursive: true });
    await mkdir(path.join(targetDir, 'audio'), { recursive: true });
    await writeFile(path.join(targetDir, 'video.mp4'), 'source-binary');
    await writeFile(path.join(targetDir, 'manifest.mpd'), '<Representation id="0" codecs="hev1.1.6.H120.90" />');
    await writeFile(path.join(targetDir, 'key.bin'), previousKey);
    await writeFile(path.join(targetDir, 'thumbnail.jpg'), encryptThumbnailEnvelope({
      imageData: originalThumbnail,
      key: previousKey,
      videoId,
    }));

    const { backfillBrowserCompatiblePlayback } = await import('../../../app/modules/playback/infrastructure/backfill/browser-compatible-playback-backfill');
    const result = await backfillBrowserCompatiblePlayback({
      createPackage: async ({
        stagingDir,
      }) => {
        const canonicalKeyId = crypto.createHash('sha256').update(videoId).digest().subarray(0, 16).toString('hex');
        await mkdir(path.join(stagingDir, 'video'), { recursive: true });
        await mkdir(path.join(stagingDir, 'audio'), { recursive: true });
        await writeFile(path.join(stagingDir, 'manifest.mpd'), `<ContentProtection cenc:default_KID="${canonicalKeyId}" /><Representation id="0" codecs="avc1.640028" />`);
        await writeFile(path.join(stagingDir, 'key.bin'), Buffer.from('8899aabbccddeeff0011223344556677', 'hex'));
        await writeFile(path.join(stagingDir, 'video', 'init.mp4'), 'video-init');
        await writeFile(path.join(stagingDir, 'video', 'segment-0001.m4s'), 'video-segment');
        await writeFile(path.join(stagingDir, 'audio', 'init.mp4'), 'audio-init');
        await writeFile(path.join(stagingDir, 'audio', 'segment-0001.m4s'), 'audio-segment');
        await writeFile(path.join(stagingDir, 'thumbnail.jpg'), encryptThumbnailEnvelope({
          imageData: Buffer.from('stale-thumbnail'),
          key: Buffer.from('8899aabbccddeeff0011223344556677', 'hex'),
          videoId,
        }));
      },
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      mediaKeyConfig: {
        masterSeed: 'browser-backfill-test-master-seed',
        saltPrefix: 'browser-backfill-salt:',
      },
      segmentDuration: 6,
      videoIds: [videoId],
      videosDir,
    });

    expect(result.failed).toEqual([]);
    expect(result.rebuilt).toEqual([videoId]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
    await expect(readFile(path.join(targetDir, 'manifest.mpd'), 'utf8')).resolves.toContain('avc1.640028');

    const currentKey = await readFile(path.join(targetDir, 'key.bin'));
    const promotedThumbnail = await readFile(path.join(targetDir, 'thumbnail.jpg'));

    expect(decryptThumbnailEnvelope({
      encryptedBuffer: promotedThumbnail,
      key: currentKey,
      videoId,
    })).toEqual(originalThumbnail);
  });

  test('runs the active backfill CLI helper with explicit --video-id filters', async () => {
    const { runBrowserCompatiblePlaybackBackfillCli } = await import('../../../app/modules/playback/infrastructure/backfill/browser-compatible-playback-backfill');
    const runBackfill = vi.fn(async () => ({
      failed: [],
      rebuilt: ['video-a'],
      skipped: [],
      warnings: [],
    }));

    const summary = await runBrowserCompatiblePlaybackBackfillCli({
      argv: ['--video-id', 'video-a', '--video-id', 'video-b'],
      runBackfill,
    });

    expect(runBackfill).toHaveBeenCalledWith({
      videoIds: ['video-a', 'video-b'],
    });
    expect(summary.rebuilt).toEqual(['video-a']);
  });
});
