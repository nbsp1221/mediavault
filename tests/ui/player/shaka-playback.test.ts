import { describe, expect, test, vi } from 'vitest';
import {
  type PlaybackEngine,
  type ShakaRuntime,
  createPlaybackRequestFilter,
  createShakaPlayback,
  playbackErrorMessage,
} from '~/pages/player/lib/shaka-playback';

function harness() {
  const network = { registerRequestFilter: vi.fn(), unregisterRequestFilter: vi.fn() };
  const engine = {
    addEventListener: vi.fn<PlaybackEngine['addEventListener']>(),
    removeEventListener: vi.fn<PlaybackEngine['removeEventListener']>(),
    attach: vi.fn<PlaybackEngine['attach']>().mockResolvedValue(undefined),
    load: vi.fn<PlaybackEngine['load']>().mockResolvedValue(undefined),
    destroy: vi.fn<PlaybackEngine['destroy']>().mockResolvedValue(undefined),
    getNetworkingEngine: () => network,
    configure: vi.fn<PlaybackEngine['configure']>().mockReturnValue(true),
    getVideoTracks: vi.fn<PlaybackEngine['getVideoTracks']>().mockReturnValue([]),
    getAudioTracks: vi.fn<PlaybackEngine['getAudioTracks']>().mockReturnValue([]),
    getTextTracks: vi.fn<PlaybackEngine['getTextTracks']>().mockReturnValue([]),
    selectVideoTrack: vi.fn<PlaybackEngine['selectVideoTrack']>(),
    selectAudioTrack: vi.fn<PlaybackEngine['selectAudioTrack']>(),
    selectTextTrack: vi.fn<PlaybackEngine['selectTextTrack']>(),
  } satisfies PlaybackEngine;
  const runtime = {
    createPlayer: vi.fn(() => engine),
    installPolyfills: vi.fn(),
    isSupported: vi.fn(() => true),
  } satisfies ShakaRuntime;
  const input = {
    licenseUrl: '/videos/video-1/clearkey',
    manifestUrl: '/videos/video-1/manifest.mpd',
    onError: vi.fn(),
    onMedia: vi.fn(),
    onReady: vi.fn(),
    origin: 'http://localhost:3000',
    readToken: () => 'test-token',
    video: document.createElement('video'),
    videoId: 'video-1',
  };
  return {
    input,
    engine,
    network,
    runtime,
    playback: createShakaPlayback(input, () => Promise.resolve(runtime)),
  };
}

describe('Shaka source lifecycle', () => {
  test('registers scoped auth before attach/load and uses the real license protocol configuration', async () => {
    const { playback, input, network, engine } = harness();
    await playback.start();
    expect(network.registerRequestFilter).toHaveBeenCalledTimes(1);
    expect(network.registerRequestFilter.mock.invocationCallOrder[0]).toBeLessThan(
      engine.load.mock.invocationCallOrder[0] ?? 0,
    );
    expect(engine.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        drm: { servers: { 'org.w3.clearkey': '/videos/video-1/clearkey' } },
      }),
    );
    expect(engine.attach).toHaveBeenCalledWith(input.video);
    expect(engine.load).toHaveBeenCalledWith(
      '/videos/video-1/manifest.mpd',
      undefined,
      'application/dash+xml',
    );
    expect(input.onReady).toHaveBeenCalledTimes(1);
    await playback.destroy();
    await playback.destroy();
    expect(engine.destroy).toHaveBeenCalledTimes(1);
    expect(network.unregisterRequestFilter).toHaveBeenCalledTimes(1);
    expect(input.onMedia).toHaveBeenLastCalledWith(null);
  });
  test('does not create an engine when an import finishes after unmount (StrictMode replay)', async () => {
    const { input, runtime } = harness();
    let finishImport: ((runtime: ShakaRuntime) => void) | undefined;
    const playback = createShakaPlayback(
      input,
      () =>
        new Promise((resolve) => {
          finishImport = resolve;
        }),
    );
    const startup = playback.start();
    await playback.destroy();
    finishImport?.(runtime);
    await startup;
    expect(runtime.createPlayer).not.toHaveBeenCalled();
    expect(input.onReady).not.toHaveBeenCalled();
  });
  test('cancels an in flight attach without loading a disposed source', async () => {
    const { input, engine, runtime } = harness();
    let finishAttach: (() => void) | undefined;
    engine.attach.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishAttach = resolve;
        }),
    );
    const playback = createShakaPlayback(input, () => Promise.resolve(runtime));
    const startup = playback.start();
    await Promise.resolve();
    await playback.destroy();
    finishAttach?.();
    await startup;
    expect(engine.load).not.toHaveBeenCalled();
    expect(input.onReady).not.toHaveBeenCalled();
    expect(engine.destroy).toHaveBeenCalledTimes(1);
  });
  test('does not emit ready after a load finishes during disposal', async () => {
    const { input, engine, runtime } = harness();
    let finishLoad: (() => void) | undefined;
    engine.load.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishLoad = resolve;
        }),
    );
    const playback = createShakaPlayback(input, () => Promise.resolve(runtime));
    const startup = playback.start();
    await Promise.resolve();
    await Promise.resolve();
    await playback.destroy();
    finishLoad?.();
    await startup;
    expect(input.onReady).not.toHaveBeenCalled();
  });
  test('surfaces a safe error and destroys partial initialization', async () => {
    const { playback, input, engine } = harness();
    engine.load.mockRejectedValue(new Error('Untrusted detailed error'));
    await playback.start();
    expect(input.onError).toHaveBeenCalledWith(
      'Could not play this video. Reload the page to try again.',
    );
    expect(engine.destroy).toHaveBeenCalledTimes(1);
    expect(input.onReady).not.toHaveBeenCalled();
  });
  test('reports browser limitations before creating an engine', async () => {
    const { playback, input, runtime } = harness();
    runtime.isSupported.mockReturnValue(false);
    await playback.start();
    expect(input.onError).toHaveBeenCalledWith(expect.stringContaining('not supported'));
    expect(runtime.createPlayer).not.toHaveBeenCalled();
  });
  test('ignores recoverable errors and tears down once for a critical error', async () => {
    const { playback, input, engine } = harness();
    await playback.start();
    const listener = engine.addEventListener.mock.calls.find(([name]) => name === 'error')?.[1];
    expect(typeof listener).toBe('function');
    if (typeof listener !== 'function') {
      return;
    }
    listener(new Event('error'));
    listener(new CustomEvent('error', { detail: { severity: 1, code: 1001 } }));
    expect(input.onError).not.toHaveBeenCalled();
    listener(new CustomEvent('error', { detail: { severity: 2, code: 6001 } }));
    expect(input.onError).toHaveBeenCalledWith(expect.stringContaining('HTTPS'));
    expect(engine.destroy).toHaveBeenCalledTimes(1);
    listener(new CustomEvent('error', { detail: { severity: 2, code: 6001 } }));
    expect(input.onError).toHaveBeenCalledTimes(1);
    await playback.destroy();
    expect(engine.destroy).toHaveBeenCalledTimes(1);
  });
  test('fails closed when no networking engine can install authorization', async () => {
    const { input, runtime, engine } = harness();
    const playback = createShakaPlayback(input, () =>
      Promise.resolve({
        ...runtime,
        createPlayer: () => ({ ...engine, getNetworkingEngine: () => null }),
      }),
    );
    await playback.start();
    expect(engine.load).not.toHaveBeenCalled();
    expect(engine.destroy).toHaveBeenCalledTimes(1);
    expect(input.onError).toHaveBeenCalledTimes(1);
  });
  test('gives an actionable key system failure without echoing library diagnostics', () => {
    expect(playbackErrorMessage({ code: 6001, data: ['private diagnostic'] })).toContain('HTTPS');
    expect(playbackErrorMessage(new Error('private diagnostic'))).not.toContain(
      'private diagnostic',
    );
  });
});

describe('video scoped request credentials', () => {
  test('reads a fresh token on every request without changing the engine or URL', () => {
    let token = 'test-token-1';
    const filter = createPlaybackRequestFilter({
      origin: 'https://vault.example',
      videoId: 'video-1',
      readToken: () => token,
    });
    const request = {
      uris: ['/videos/video-1/video/segment-0001.m4s'],
      headers: { Range: 'bytes=0-31' },
    };
    filter(request);
    expect(request).toMatchObject({
      headers: { Authorization: 'Bearer test-token-1', Range: 'bytes=0-31' },
    });
    token = 'test-token-2';
    filter(request);
    expect(request).toMatchObject({
      headers: { Authorization: 'Bearer test-token-2' },
      uris: ['/videos/video-1/video/segment-0001.m4s'],
    });
  });
  test.each([
    'https://foreign.example/videos/video-1/clearkey',
    '/videos/video-2/clearkey',
    '/videos/video-1/manifest.mpd?token=x',
    '/videos/video-1/video/../../video-2/clearkey',
    '/videos/video-1/key.bin',
    '/videos/video-1/video/segment-1.m4s#key',
  ])('rejects a credential escape to %s', (uri) => {
    const request = { uris: [uri], headers: {} };
    const filter = createPlaybackRequestFilter({
      origin: 'https://vault.example',
      videoId: 'video-1',
      readToken: () => 'test-token',
    });
    expect(() => filter(request)).toThrow('Unexpected playback resource');
    expect(request.headers).toEqual({});
  });
  test('validates every fallback URI before attaching the header', () => {
    const request = {
      uris: ['/videos/video-1/clearkey', 'https://foreign.example/license'],
      headers: {},
    };
    const filter = createPlaybackRequestFilter({
      origin: 'https://vault.example',
      videoId: 'video-1',
      readToken: () => 'test-token',
    });
    expect(() => filter(request)).toThrow();
    expect(request.headers).toEqual({});
  });
  test('rejects missing credentials rather than sending an unauthenticated license', () => {
    const filter = createPlaybackRequestFilter({
      origin: 'https://vault.example',
      videoId: 'video-1',
      readToken: () => null,
    });
    expect(() => filter({ uris: ['/videos/video-1/clearkey'], headers: {} })).toThrow(
      'authorization is unavailable',
    );
  });
});
