import { describe, expect, test, vi } from 'vitest';

const accessibleVideoRead = {
  findLibraryVideoById: vi.fn(async () => ({} as never)),
};

describe('ServePlaybackMediaSegmentUseCase', () => {
  test('validates the playback token and preserves range-response metadata from the media adapter', async () => {
    const { ServePlaybackMediaSegmentUseCase } = await import('./serve-playback-media-segment.usecase');
    const stream = new ReadableStream<Uint8Array>();
    const serveSegment = vi.fn(async () => ({
      headers: {
        'Content-Length': '128',
        'Content-Range': 'bytes 0-127/512',
      },
      isRangeResponse: true,
      statusCode: 206,
      stream,
    }));
    const useCase = new ServePlaybackMediaSegmentUseCase({
      mediaSegmentService: {
        serveSegment,
      },
      tokenService: {
        issue: async () => '',
        validate: async () => ({ userId: 'owner-1', videoId: 'video-1' }),
      },
      videoRead: accessibleVideoRead,
    });

    const result = await useCase.execute({
      filename: 'segment-1.m4s',
      mediaType: 'video',
      rangeHeader: 'bytes=0-127',
      token: 'signed-token',
      userId: 'owner-1',
      videoId: 'video-1',
    });

    expect(result).toEqual({
      headers: {
        'Content-Length': '128',
        'Content-Range': 'bytes 0-127/512',
      },
      isRangeResponse: true,
      ok: true,
      statusCode: 206,
      stream,
    });
    expect(serveSegment).toHaveBeenCalledWith({
      filename: 'segment-1.m4s',
      mediaType: 'video',
      rangeHeader: 'bytes=0-127',
      videoId: 'video-1',
    });
  });

  test('maps audio-segment scope mismatches to an explicit application result', async () => {
    const { ServePlaybackMediaSegmentUseCase } = await import('./serve-playback-media-segment.usecase');
    const useCase = new ServePlaybackMediaSegmentUseCase({
      mediaSegmentService: {
        serveSegment: async () => ({
          headers: {},
          isRangeResponse: false,
          stream: new ReadableStream<Uint8Array>(),
        }),
      },
      tokenService: {
        issue: async () => '',
        validate: async () => ({ userId: 'owner-1', videoId: 'video-2' }),
      },
      videoRead: accessibleVideoRead,
    });

    const result = await useCase.execute({
      filename: 'init.mp4',
      mediaType: 'audio',
      rangeHeader: null,
      token: 'signed-token',
      userId: 'owner-1',
      videoId: 'video-1',
    });

    expect(result).toEqual({
      metadata: {
        requestedVideoId: 'video-1',
        requestedUserId: 'owner-1',
        resource: 'audio-segment',
        tokenVideoId: 'video-2',
        tokenUserId: 'owner-1',
      },
      ok: false,
      reason: 'VIDEO_SCOPE_MISMATCH',
    });
  });

  test('returns not found when current video access is revoked after token issuance', async () => {
    const { ServePlaybackMediaSegmentUseCase } = await import('./serve-playback-media-segment.usecase');
    const serveSegment = vi.fn();
    const useCase = new ServePlaybackMediaSegmentUseCase({
      mediaSegmentService: {
        serveSegment,
      },
      tokenService: {
        issue: async () => '',
        validate: async () => ({ userId: 'owner-1', videoId: 'video-1' }),
      },
      videoRead: {
        findLibraryVideoById: vi.fn(async () => null),
      },
    });

    await expect(useCase.execute({
      filename: 'init.mp4',
      mediaType: 'video',
      rangeHeader: null,
      token: 'signed-token',
      userId: 'owner-1',
      videoId: 'video-1',
    })).resolves.toEqual({
      metadata: {
        requestedVideoId: 'video-1',
        requestedUserId: 'owner-1',
        resource: 'segment',
      },
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });
    expect(serveSegment).not.toHaveBeenCalled();
  });
});
