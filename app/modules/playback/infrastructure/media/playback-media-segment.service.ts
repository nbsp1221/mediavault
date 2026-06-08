import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { getStoragePaths } from '~/shared/config/app-config.server';
import type { PlaybackMediaSegmentService as PlaybackMediaSegmentServicePort } from '../../application/ports/playback-media-segment-service.port';
import { assertValidPlaybackVideoId } from '../../domain/playback-video-id';
import {
  createPlaybackMediaError,
  getPlaybackSegmentContentType,
  isValidPlaybackSegmentFilename,
  parsePlaybackRangeHeader,
} from './playback-media-segment-helpers';

export class PlaybackMediaSegmentService implements PlaybackMediaSegmentServicePort {
  async serveSegment(input: Parameters<PlaybackMediaSegmentServicePort['serveSegment']>[0]) {
    assertValidPlaybackVideoId(input.videoId);

    if (!isValidPlaybackSegmentFilename(input.filename)) {
      throw createPlaybackMediaError('ValidationError', 'Invalid DASH segment filename', 400);
    }

    const filePath = join(
      getStoragePaths().videosDir,
      input.videoId,
      input.mediaType,
      input.filename,
    );

    let fileStats: Awaited<ReturnType<typeof stat>>;

    try {
      fileStats = await stat(filePath);
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw createPlaybackMediaError('NotFoundError', `${input.mediaType} segment not found`, 404);
      }

      throw error;
    }

    const contentType = getPlaybackSegmentContentType(input.filename, input.mediaType);

    if (!input.rangeHeader) {
      const headers: Record<string, string> = {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Content-Length': String(fileStats.size),
        'Content-Type': contentType,
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      };

      return {
        headers,
        isRangeResponse: false,
        stream: createReadStream(filePath) as unknown as ReadableStream,
      };
    }

    const { end, start } = parsePlaybackRangeHeader(input.rangeHeader, fileStats.size);
    const contentLength = (end - start) + 1;
    const headers: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Length': String(contentLength),
      'Content-Range': `bytes ${start}-${end}/${fileStats.size}`,
      'Content-Type': contentType,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    };

    return {
      headers,
      isRangeResponse: true,
      statusCode: 206,
      stream: createReadStream(filePath, { end, start }) as unknown as ReadableStream,
    };
  }
}
