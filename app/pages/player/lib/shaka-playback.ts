import type shaka from 'shaka-player';
import { ShakaMedia, type TrackEngine } from '~/pages/player/lib/shaka-media';

export interface PlaybackEngine extends TrackEngine {
  attach: (video: HTMLMediaElement) => Promise<unknown>;
  load: (url: string, startTime?: number, mimeType?: string) => Promise<unknown>;
  destroy: () => Promise<unknown>;
  getNetworkingEngine: () => Pick<
    shaka.net.NetworkingEngine,
    'registerRequestFilter' | 'unregisterRequestFilter'
  > | null;
}

export interface ShakaRuntime {
  createPlayer: () => PlaybackEngine;
  installPolyfills: () => void;
  isSupported: () => boolean;
}

async function loadRuntime(): Promise<ShakaRuntime> {
  const { default: runtime } = await import('shaka-player/dist/shaka-player.compiled.js');
  return {
    createPlayer: () => new runtime.Player(),
    installPolyfills: () => runtime.polyfill.installAll(),
    isSupported: () => runtime.Player.isBrowserSupported(),
  };
}

export function createPlaybackRequestFilter(input: {
  origin: string;
  readToken: () => string | null;
  videoId: string;
}) {
  const root = `/videos/${encodeURIComponent(input.videoId)}/`;
  return (request: { headers: Record<string, string>; uris: string[] }) => {
    for (const uri of request.uris) {
      const url = new URL(uri, input.origin);
      const relativePath = url.pathname.slice(root.length);
      const allowed =
        url.pathname.startsWith(root) &&
        (relativePath === 'manifest.mpd' ||
          relativePath === 'clearkey' ||
          /^(audio|video)\/(init\.mp4|segment-\d+\.m4s)$/.test(relativePath));
      if (
        url.origin !== input.origin ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !allowed
      ) {
        throw new Error('Unexpected playback resource.');
      }
    }
    const token = input.readToken();
    if (!token) {
      throw new Error('Playback authorization is unavailable.');
    }
    request.headers.Authorization = `Bearer ${token}`;
  };
}

export function playbackErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 6000 || error.code === 6001)
  ) {
    return 'This browser cannot play this encrypted video. Try a supported browser over HTTPS.';
  }
  return 'Could not play this video. Reload the page to try again.';
}

/** One source owns one engine. Import/attach/load can finish after cleanup; none may revive a disposed source. */
export function createShakaPlayback(
  input: {
    licenseUrl: string;
    manifestUrl: string;
    onError: (message: string) => void;
    onMedia: (media: ShakaMedia | null) => void;
    onReady: () => void;
    origin: string;
    readToken: () => string | null;
    video: HTMLVideoElement;
    videoId: string;
  },
  runtimeLoader: () => Promise<ShakaRuntime> = loadRuntime,
) {
  const abort = new AbortController();
  let engine: PlaybackEngine | null = null;
  let media: ShakaMedia | null = null;
  let destruction: Promise<void> | null = null;
  let requestFilter: shaka.extern.RequestFilter | null = null;

  const onError = (event: Event) => {
    if (abort.signal.aborted || !('detail' in event)) {
      return;
    }
    const detail: unknown = event.detail;
    if (
      typeof detail === 'object' &&
      detail !== null &&
      'severity' in detail &&
      detail.severity === 1
    ) {
      return;
    }
    input.onError(playbackErrorMessage(detail));
    void destroy().catch(() => {});
  };

  const destroy = (): Promise<void> => {
    abort.abort();
    if (destruction) {
      return destruction;
    }
    input.onMedia(null);
    media?.destroy();
    media = null;
    if (engine) {
      engine.removeEventListener('error', onError);
      if (requestFilter) {
        engine.getNetworkingEngine()?.unregisterRequestFilter(requestFilter);
      }
      destruction = engine.destroy().then(() => {});
    } else {
      destruction = Promise.resolve();
    }
    return destruction;
  };

  const start = async () => {
    try {
      const runtime = await runtimeLoader();
      abort.signal.throwIfAborted();
      runtime.installPolyfills();
      if (globalThis.isSecureContext === false || !runtime.isSupported()) {
        input.onError(
          'Secure playback is not supported in this browser. Use HTTPS and a supported browser.',
        );
        return;
      }
      engine = runtime.createPlayer();
      const authorize = createPlaybackRequestFilter(input);
      // Validate both entrypoints before handing them to the engine; no credential can escape this video scope.
      authorize({ headers: {}, uris: [input.manifestUrl, input.licenseUrl] });
      requestFilter = (_type, request) => authorize(request);
      const network = engine.getNetworkingEngine();
      if (!network) {
        throw new Error('Playback networking is unavailable.');
      }
      network.registerRequestFilter(requestFilter);
      engine.addEventListener('error', onError);
      media = new ShakaMedia(engine, input.video);
      input.onMedia(media);
      engine.configure({
        drm: { servers: { 'org.w3.clearkey': input.licenseUrl } },
        streaming: { bufferingGoal: 10, rebufferingGoal: 1, bufferBehind: 20 },
      });
      await engine.attach(input.video);
      abort.signal.throwIfAborted();
      await engine.load(input.manifestUrl, undefined, 'application/dash+xml');
      abort.signal.throwIfAborted();
      media.syncTracks();
      input.onReady();
    } catch (error) {
      if (!abort.signal.aborted) {
        input.onError(playbackErrorMessage(error));
        await destroy().catch(() => {});
      }
    }
  };

  return { destroy, start };
}
