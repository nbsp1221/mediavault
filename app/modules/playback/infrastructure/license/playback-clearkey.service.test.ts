import crypto from 'node:crypto';
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

describe('PlaybackClearKeyService', () => {
  test('reads key.bin from the active playback storage path and preserves the ClearKey response contract', async () => {
    const { PlaybackClearKeyService } = await import('./playback-clearkey.service');
    const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-clearkey-'));
    process.env.MEDIAVAULT_STORAGE_DIR = rootDir;
    await mkdir(path.join(rootDir, 'videos', 'video-1'), { recursive: true });
    const keyBuffer = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    await writeFile(path.join(rootDir, 'videos', 'video-1', 'key.bin'), keyBuffer);

    const service = new PlaybackClearKeyService();

    try {
      const result = await service.serveLicense({
        videoId: 'video-1',
      });

      const keyIdHex = crypto.createHash('sha256').update('video-1').digest().subarray(0, 16).toString('hex');

      expect(result).toEqual({
        body: JSON.stringify({
          keys: [
            {
              k: keyBuffer.toString('base64url'),
              kid: Buffer.from(keyIdHex, 'hex').toString('base64url'),
              kty: 'oct',
            },
          ],
          type: 'temporary',
        }),
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Content-Type': 'application/json',
          'Expires': '0',
          'Pragma': 'no-cache',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        },
      });
    }
    finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  test('throws when the packaged key file is missing', async () => {
    const { PlaybackClearKeyService } = await import('./playback-clearkey.service');
    const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-clearkey-'));
    process.env.MEDIAVAULT_STORAGE_DIR = rootDir;
    await mkdir(path.join(rootDir, 'videos', 'video-1'), { recursive: true });

    const service = new PlaybackClearKeyService();

    try {
      await expect(service.serveLicense({
        videoId: 'video-1',
      })).rejects.toMatchObject({
        name: 'NotFoundError',
        statusCode: 404,
      });
    }
    finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  test('rejects unsafe playback video ids before touching the filesystem', async () => {
    const { PlaybackClearKeyService } = await import('./playback-clearkey.service');
    const service = new PlaybackClearKeyService();

    await expect(service.serveLicense({
      videoId: '../escape',
    })).rejects.toMatchObject({
      message: 'Invalid video ID format',
      name: 'ValidationError',
      statusCode: 400,
    });
  });

  test('preserves the canonical playback key-id derivation algorithm', async () => {
    const { generatePlaybackKeyId } = await import('./generate-playback-key-id');

    expect(generatePlaybackKeyId('video-1')).toBe(
      crypto.createHash('sha256').update('video-1').digest().subarray(0, 16).toString('hex'),
    );
  });
});
