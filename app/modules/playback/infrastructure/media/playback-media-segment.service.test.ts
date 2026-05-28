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

describe('PlaybackMediaSegmentService', () => {
  test('serves an entire DASH segment from the active playback storage path', async () => {
    const { PlaybackMediaSegmentService } = await import('./playback-media-segment.service');
    const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-segment-'));
    process.env.MEDIAVAULT_STORAGE_DIR = rootDir;
    await mkdir(path.join(rootDir, 'videos', 'video-1', 'video'), { recursive: true });
    await writeFile(path.join(rootDir, 'videos', 'video-1', 'video', 'segment-0001.m4s'), 'segment-data');

    const service = new PlaybackMediaSegmentService();

    try {
      const result = await service.serveSegment({
        filename: 'segment-0001.m4s',
        mediaType: 'video',
        rangeHeader: null,
        videoId: 'video-1',
      });

      expect(result.isRangeResponse).toBe(false);
      expect(result.statusCode).toBeUndefined();
      expect(result.headers).toEqual({
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Content-Length': '12',
        'Content-Type': 'video/iso.segment',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      });
      expect(result.stream).toBeTruthy();
    }
    finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  test('preserves range-response metadata and stream handles for partial segment reads', async () => {
    const { PlaybackMediaSegmentService } = await import('./playback-media-segment.service');
    const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-segment-'));
    process.env.MEDIAVAULT_STORAGE_DIR = rootDir;
    await mkdir(path.join(rootDir, 'videos', 'video-1', 'video'), { recursive: true });
    await writeFile(path.join(rootDir, 'videos', 'video-1', 'video', 'segment-0001.m4s'), 'segment-data');

    const service = new PlaybackMediaSegmentService();

    try {
      const result = await service.serveSegment({
        filename: 'segment-0001.m4s',
        mediaType: 'video',
        rangeHeader: 'bytes=0-6',
        videoId: 'video-1',
      });

      expect(result).toEqual({
        headers: {
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
          'Content-Length': '7',
          'Content-Range': 'bytes 0-6/12',
          'Content-Type': 'video/iso.segment',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
        },
        isRangeResponse: true,
        statusCode: 206,
        stream: expect.anything(),
      });
    }
    finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  test('throws a not-found error when the requested segment file is missing', async () => {
    const { PlaybackMediaSegmentService } = await import('./playback-media-segment.service');
    const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-segment-'));
    process.env.MEDIAVAULT_STORAGE_DIR = rootDir;
    await mkdir(path.join(rootDir, 'videos', 'video-1', 'video'), { recursive: true });

    const service = new PlaybackMediaSegmentService();

    try {
      await expect(service.serveSegment({
        filename: 'segment-0001.m4s',
        mediaType: 'video',
        rangeHeader: null,
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

  test('throws a validation error for an invalid DASH segment filename', async () => {
    const { PlaybackMediaSegmentService } = await import('./playback-media-segment.service');
    const service = new PlaybackMediaSegmentService();

    await expect(service.serveSegment({
      filename: '../segment-0001.m4s',
      mediaType: 'video',
      rangeHeader: null,
      videoId: 'video-1',
    })).rejects.toMatchObject({
      name: 'ValidationError',
      statusCode: 400,
    });
  });

  test('throws a range error with the current Content-Range header contract for invalid ranges', async () => {
    const { PlaybackMediaSegmentService } = await import('./playback-media-segment.service');
    const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-segment-'));
    process.env.MEDIAVAULT_STORAGE_DIR = rootDir;
    await mkdir(path.join(rootDir, 'videos', 'video-1', 'video'), { recursive: true });
    await writeFile(path.join(rootDir, 'videos', 'video-1', 'video', 'segment-0001.m4s'), 'segment-data');

    const service = new PlaybackMediaSegmentService();

    try {
      await expect(service.serveSegment({
        filename: 'segment-0001.m4s',
        mediaType: 'video',
        rangeHeader: 'bytes=20-25',
        videoId: 'video-1',
      })).rejects.toMatchObject({
        headers: {
          'Content-Range': 'bytes */12',
        },
        name: 'ValidationError',
        statusCode: 416,
      });
    }
    finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  test('rejects unsafe playback video ids before touching the filesystem', async () => {
    const { PlaybackMediaSegmentService } = await import('./playback-media-segment.service');
    const service = new PlaybackMediaSegmentService();

    await expect(service.serveSegment({
      filename: 'segment-0001.m4s',
      mediaType: 'video',
      rangeHeader: null,
      videoId: '../escape',
    })).rejects.toMatchObject({
      message: 'Invalid video ID format',
      name: 'ValidationError',
      statusCode: 400,
    });
  });
});
