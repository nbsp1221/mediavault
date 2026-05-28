import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

const ORIGINAL_STORAGE_DIR = process.env.MEDIAVAULT_STORAGE_DIR;

afterEach(() => {
  vi.resetModules();

  if (ORIGINAL_STORAGE_DIR === undefined) {
    delete process.env.MEDIAVAULT_STORAGE_DIR;
    return;
  }

  process.env.MEDIAVAULT_STORAGE_DIR = ORIGINAL_STORAGE_DIR;
});

describe('PlaybackManifestService', () => {
  const validVideoId = '68e5f819-15e8-41ef-90ee-8a96769311b7';

  test('reads manifest.mpd from the active playback storage path', async () => {
    const { PlaybackManifestService } = await import('./playback-manifest.service');
    const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-manifest-'));
    process.env.MEDIAVAULT_STORAGE_DIR = rootDir;
    await mkdir(path.join(rootDir, 'videos', validVideoId), { recursive: true });
    await writeFile(path.join(rootDir, 'videos', validVideoId, 'manifest.mpd'), '<MPD />');
    await writeFile(path.join(rootDir, 'videos', validVideoId, 'key.bin'), Buffer.alloc(16));

    const service = new PlaybackManifestService();

    try {
      const result = await service.getManifest({
        videoId: validVideoId,
      });

      expect(result).toEqual({
        body: '<MPD />',
        headers: {
          'Cache-Control': 'no-store',
          'Content-Length': '7',
          'Content-Type': 'application/dash+xml',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  test('throws when manifest.mpd is missing from the active playback storage path', async () => {
    const { PlaybackManifestService } = await import('./playback-manifest.service');
    const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-manifest-'));
    process.env.MEDIAVAULT_STORAGE_DIR = rootDir;
    await mkdir(path.join(rootDir, 'videos', validVideoId), { recursive: true });

    const service = new PlaybackManifestService();

    try {
      await expect(service.getManifest({
        videoId: validVideoId,
      })).rejects.toMatchObject({
        message: 'Playback manifest not found',
        name: 'NotFoundError',
        statusCode: 404,
      });
    }
    finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  test('throws when the encryption key is missing even if manifest.mpd exists', async () => {
    const { PlaybackManifestService } = await import('./playback-manifest.service');
    const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-manifest-'));
    process.env.MEDIAVAULT_STORAGE_DIR = rootDir;
    await mkdir(path.join(rootDir, 'videos', validVideoId), { recursive: true });
    await writeFile(path.join(rootDir, 'videos', validVideoId, 'manifest.mpd'), '<MPD />');

    const service = new PlaybackManifestService();

    try {
      await expect(service.getManifest({
        videoId: validVideoId,
      })).rejects.toMatchObject({
        message: 'Video encryption key not found',
        name: 'NotFoundError',
        statusCode: 404,
      });
    }
    finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  test('rejects invalid video IDs before resolving the manifest path', async () => {
    const { PlaybackManifestService } = await import('./playback-manifest.service');
    const service = new PlaybackManifestService();

    await expect(service.getManifest({
      videoId: '../escape',
    })).rejects.toMatchObject({
      message: 'Invalid video ID format',
      name: 'ValidationError',
      statusCode: 400,
    });
  });
});
