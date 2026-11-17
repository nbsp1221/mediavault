import path from 'node:path';
import type { PlaybackMediaType } from '../../application/ports/playback-media-segment-service.port';

export function getPlaybackSegmentContentType(
  filename: string,
  mediaType: PlaybackMediaType,
): string {
  const extension = path.extname(filename).toLowerCase();

  if (extension === '.mp4') {
    return mediaType === 'video' ? 'video/mp4' : 'audio/mp4';
  }

  if (extension === '.m4s') {
    return mediaType === 'video' ? 'video/iso.segment' : 'audio/iso.segment';
  }

  return mediaType === 'video' ? 'video/mp4' : 'audio/mp4';
}

export function isValidPlaybackSegmentFilename(filename: string): boolean {
  if (
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0')
  ) {
    return false;
  }

  return /^(init\.mp4|segment-\d{4}\.m4s)$/.test(filename);
}

interface ParsedRange {
  end: number;
  start: number;
}

export function parsePlaybackRangeHeader(rangeHeader: string, fileSize: number): ParsedRange {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());

  if (!match) {
    throw createPlaybackMediaError('ValidationError', 'Invalid range header', 400);
  }

  const [, startValue, endValue] = match;

  if (startValue === '' && endValue === '') {
    throw createPlaybackMediaError('ValidationError', 'Invalid range header', 400);
  }

  if (startValue === '') {
    const suffixLength = Number.parseInt(endValue, 10);

    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      throw createPlaybackMediaError('ValidationError', 'Invalid range header', 400);
    }

    if (suffixLength >= fileSize) {
      return {
        end: fileSize - 1,
        start: 0,
      };
    }

    return {
      end: fileSize - 1,
      start: fileSize - suffixLength,
    };
  }

  const start = Number.parseInt(startValue, 10);
  const end = endValue === '' ? fileSize - 1 : Number.parseInt(endValue, 10);

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize ||
    end >= fileSize
  ) {
    throw createPlaybackMediaError('ValidationError', 'Range not satisfiable', 416, {
      'Content-Range': `bytes */${fileSize}`,
    });
  }

  return {
    end,
    start,
  };
}

export function createPlaybackMediaError(
  name: 'NotFoundError' | 'ValidationError',
  message: string,
  statusCode: number,
  headers?: Record<string, string>,
) {
  return Object.assign(new Error(message), {
    ...(headers ? { headers } : {}),
    name,
    statusCode,
  });
}
