import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';

const RETIRED_PLAYBACK_FILENAMES = [
  'legacy-video-catalog.adapter',
  'legacy-playback-manifest.service.adapter',
  'legacy-playback-media-segment.service.adapter',
  'legacy-playback-clearkey.service.adapter',
] as const;

function expectSourceToExcludeRetiredPlaybackFilenames(source: string) {
  for (const fileName of RETIRED_PLAYBACK_FILENAMES) {
    expect(source).not.toContain(fileName);
    expect(source.match(new RegExp(fileName.replaceAll('.', '\\.'), 'g')) ?? []).toHaveLength(0);
  }
}

describe('server playback composition root', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET;
  });

  test('creates prewired playback use cases from injected playback adapters', async () => {
    const { createServerPlaybackServices } = await import('./playback');
    const issue = vi.fn(async () => 'signed-token');
    const validate = vi.fn(async (token: string) => (token === 'signed-token'
      ? { videoId: 'video-1' }
      : null));
    const services = createServerPlaybackServices({
      clearKeyService: {
        serveLicense: async () => ({
          body: '{"keys":[]}',
          headers: { 'Content-Type': 'application/json' },
        }),
      },
      manifestService: {
        getManifest: async () => ({
          body: '<MPD />',
          headers: { 'Content-Type': 'application/dash+xml' },
        }),
      },
      mediaSegmentService: {
        serveSegment: async () => ({
          headers: { 'Content-Length': '64' },
          isRangeResponse: false,
          stream: new ReadableStream<Uint8Array>(),
        }),
      },
      tokenService: {
        issue,
        validate,
      },
      videoCatalog: {
        getPlayerVideo: async () => ({
          relatedVideos: [],
          video: {
            createdAt: new Date('2026-03-09T00:00:00.000Z'),
            duration: 60,
            id: 'video-1',
            tags: ['vault'],
            title: 'Player video',
            videoUrl: '/videos/video-1/manifest.mpd',
          },
        }),
      },
    });

    await expect(services.issuePlaybackToken.execute({
      hasSiteSession: true,
      videoId: 'video-1',
    })).resolves.toEqual({
      success: true,
      token: 'signed-token',
      urls: {
        clearkey: '/videos/video-1/clearkey?token=signed-token',
        manifest: '/videos/video-1/manifest.mpd?token=signed-token',
      },
    });
    await expect(services.resolvePlayerVideo.execute({
      videoId: 'video-1',
    })).resolves.toEqual({
      ok: true,
      relatedVideos: [],
      video: expect.objectContaining({
        id: 'video-1',
        title: 'Player video',
      }),
    });
    await expect(services.servePlaybackManifest.execute({
      token: 'signed-token',
      videoId: 'video-1',
    })).resolves.toEqual({
      body: '<MPD />',
      headers: { 'Content-Type': 'application/dash+xml' },
      ok: true,
    });
    await expect(services.servePlaybackMediaSegment.execute({
      filename: 'init.mp4',
      mediaType: 'video',
      rangeHeader: null,
      token: 'signed-token',
      videoId: 'video-1',
    })).resolves.toEqual({
      headers: { 'Content-Length': '64' },
      isRangeResponse: false,
      ok: true,
      statusCode: undefined,
      stream: expect.any(ReadableStream),
    });
    await expect(services.servePlaybackClearKeyLicense.execute({
      token: 'signed-token',
      videoId: 'video-1',
    })).resolves.toEqual({
      body: '{"keys":[]}',
      headers: { 'Content-Type': 'application/json' },
      ok: true,
    });

    expect(issue).toHaveBeenCalledOnce();
    expect(validate).toHaveBeenCalledTimes(3);
  });

  test('returns a cached default playback composition that stays ready for route usage', async () => {
    process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET = 'phase-2-secret';
    const { getServerPlaybackServices } = await import('./playback');

    const first = getServerPlaybackServices();
    const second = getServerPlaybackServices();

    expect(first).toBe(second);
    expect(first.issuePlaybackToken).toBeDefined();
    expect(first.resolvePlayerVideo).toBeDefined();
    expect(first.servePlaybackManifest).toBeDefined();
    expect(first.servePlaybackMediaSegment).toBeDefined();
    expect(first.servePlaybackClearKeyLicense).toBeDefined();
  });

  test('does not assemble legacy-named playback infrastructure directly in the composition root', async () => {
    const source = await readFile(new URL('./playback.ts', import.meta.url), 'utf8');

    expectSourceToExcludeRetiredPlaybackFilenames(source);
    expect(source).toContain('jsonwebtoken-playback-token.service');
    expect(source).not.toContain('/token/playback-token.service');
  });

  test('does not construct unrelated playback defaults when only token issuance is exercised', async () => {
    const { createServerPlaybackServices } = await import('./playback');
    const issue = vi.fn(async () => 'signed-token');
    const services = createServerPlaybackServices({
      tokenService: {
        issue,
        validate: async () => null,
      },
    });

    await expect(services.issuePlaybackToken.execute({
      hasSiteSession: true,
      videoId: 'video-1',
    })).resolves.toEqual({
      success: true,
      token: 'signed-token',
      urls: {
        clearkey: '/videos/video-1/clearkey?token=signed-token',
        manifest: '/videos/video-1/manifest.mpd?token=signed-token',
      },
    });
    expect(issue).toHaveBeenCalledOnce();
  });

  test('does not require playback encryption env when only player catalog resolution is used', async () => {
    const { createServerPlaybackServices } = await import('./playback');
    const services = createServerPlaybackServices({
      videoCatalog: {
        getPlayerVideo: async () => null,
      },
    });

    await expect(services.resolvePlayerVideo.execute({
      videoId: 'missing-video',
    })).resolves.toEqual({
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    });
  });
});
