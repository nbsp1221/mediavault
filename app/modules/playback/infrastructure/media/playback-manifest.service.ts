import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getStoragePaths } from '~/shared/config/app-config.server';
import type { PlaybackManifestService as PlaybackManifestServicePort } from '../../application/ports/playback-manifest-service.port';
import { assertValidPlaybackVideoId } from '../../domain/playback-video-id';

export class PlaybackManifestService implements PlaybackManifestServicePort {
  async getManifest(input: Parameters<PlaybackManifestServicePort['getManifest']>[0]) {
    assertValidPlaybackVideoId(input.videoId);

    const videoDir = join(getStoragePaths().videosDir, input.videoId);
    const manifestPath = join(videoDir, 'manifest.mpd');
    const keyPath = join(videoDir, 'key.bin');

    let body: string;

    try {
      body = await readFile(manifestPath, 'utf8');
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw Object.assign(new Error('Playback manifest not found'), {
          name: 'NotFoundError',
          statusCode: 404,
        });
      }

      throw error;
    }

    try {
      await access(keyPath);
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw Object.assign(new Error('Video encryption key not found'), {
          name: 'NotFoundError',
          statusCode: 404,
        });
      }

      throw error;
    }

    return {
      body,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Length': String(Buffer.byteLength(body)),
        'Content-Type': 'application/dash+xml',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    };
  }
}
