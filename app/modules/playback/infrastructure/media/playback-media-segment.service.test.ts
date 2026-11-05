import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PlaybackMediaSegmentService } from './playback-media-segment.service';

const ORIGINAL_STORAGE_DIR = process.env.MEDIAVAULT_STORAGE_DIR;
const roots: string[] = [];
const segmentBytes = Buffer.from([0, 1, 255, 128, 0, 170, 2, 3, 4, 5, 6, 7]);

async function seedSegment(bytes: Uint8Array = segmentBytes) {
  const root = await mkdtemp(path.join(tmpdir(), 'playback-segment-'));
  roots.push(root);
  process.env.MEDIAVAULT_STORAGE_DIR = root;
  const directory = path.join(root, 'videos', 'video-1', 'video');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'segment-0001.m4s'), bytes);
}

const request = {
  filename: 'segment-0001.m4s',
  mediaType: 'video',
  rangeHeader: null,
  videoId: 'video-1',
} as const;

afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
  if (ORIGINAL_STORAGE_DIR === undefined) {
    delete process.env.MEDIAVAULT_STORAGE_DIR;
  } else {
    process.env.MEDIAVAULT_STORAGE_DIR = ORIGINAL_STORAGE_DIR;
  }
});

describe('PlaybackMediaSegmentService', () => {
  test('serves exact binary bytes through a standard Fetch 200 response', async () => {
    await seedSegment();
    const result = await new PlaybackMediaSegmentService().serveSegment(request);
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
    const response = new Response(result.stream, {
      headers: result.headers,
      status: result.statusCode ?? 200,
    });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(segmentBytes);
  });

  test('serves exactly the requested inclusive range through a Fetch 206 response', async () => {
    await seedSegment();
    const result = await new PlaybackMediaSegmentService().serveSegment({
      ...request,
      rangeHeader: 'bytes=0-6',
    });
    expect(result.isRangeResponse).toBe(true);
    expect(result.statusCode).toBe(206);
    expect(result.headers).toEqual({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Length': '7',
      'Content-Range': 'bytes 0-6/12',
      'Content-Type': 'video/iso.segment',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    const response = new Response(result.stream, {
      headers: result.headers,
      status: result.statusCode,
    });
    expect(response.status).toBe(206);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(segmentBytes.subarray(0, 7));
  });

  test('cancels an unread Fetch body and closes the real underlying Node file stream', async () => {
    await seedSegment(Buffer.alloc(2 * 1024 * 1024, 171));
    const conversion = vi.spyOn(Readable, 'toWeb');
    const result = await new PlaybackMediaSegmentService().serveSegment(request);
    expect(conversion).toHaveBeenCalledTimes(1);
    const nodeStream = conversion.mock.calls[0][0];
    if (!(nodeStream instanceof Readable)) {
      throw new Error('Expected a real Node readable');
    }
    const response = new Response(result.stream);
    if (!response.body) {
      throw new Error('Expected a Fetch response body');
    }
    await response.body.cancel();
    await vi.waitFor(() => {
      expect(nodeStream.closed).toBe(true);
    });
    expect(nodeStream.destroyed).toBe(true);
    expect(nodeStream.readableAborted).toBe(true);
  });

  test('preserves streamed byte chunks and propagates reader cancellation after the first chunk', async () => {
    const bytes = Buffer.alloc(2 * 1024 * 1024, 171);
    await seedSegment(bytes);
    const conversion = vi.spyOn(Readable, 'toWeb');
    const result = await new PlaybackMediaSegmentService().serveSegment(request);
    const nodeStream = conversion.mock.calls[0][0];
    if (!(nodeStream instanceof Readable)) {
      throw new Error('Expected a real Node readable');
    }
    const response = new Response(result.stream);
    if (!response.body) {
      throw new Error('Expected a Fetch response body');
    }
    const reader = response.body.getReader();
    try {
      const first = await reader.read();
      expect(first.done).toBe(false);
      if (!first.value) {
        throw new Error('Expected binary segment bytes');
      }
      expect(first.value.byteLength).toBeGreaterThan(0);
      expect(Buffer.from(first.value)).toEqual(bytes.subarray(0, first.value.byteLength));
      await reader.cancel();
      await vi.waitFor(() => {
        expect(nodeStream.closed).toBe(true);
      });
      expect(nodeStream.destroyed).toBe(true);
      expect(nodeStream.readableAborted).toBe(true);
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  });

  test('throws a not-found error for a missing segment', async () => {
    await seedSegment();
    await expect(
      new PlaybackMediaSegmentService().serveSegment({ ...request, filename: 'segment-0002.m4s' }),
    ).rejects.toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });

  test('rejects an invalid filename before creating a stream', async () => {
    await expect(
      new PlaybackMediaSegmentService().serveSegment({
        ...request,
        filename: '../segment-0001.m4s',
      }),
    ).rejects.toMatchObject({ name: 'ValidationError', statusCode: 400 });
  });

  test('preserves invalid range status and Content-Range metadata', async () => {
    await seedSegment();
    await expect(
      new PlaybackMediaSegmentService().serveSegment({ ...request, rangeHeader: 'bytes=20-25' }),
    ).rejects.toMatchObject({
      headers: { 'Content-Range': 'bytes */12' },
      name: 'ValidationError',
      statusCode: 416,
    });
  });

  test('rejects unsafe video ids before touching the filesystem', async () => {
    await expect(
      new PlaybackMediaSegmentService().serveSegment({ ...request, videoId: '../escape' }),
    ).rejects.toMatchObject({
      message: 'Invalid video ID format',
      name: 'ValidationError',
      statusCode: 400,
    });
  });
});
