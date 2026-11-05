import { useEffect, useState } from 'react';
import { z } from 'zod';

const DEFAULT_REFRESH_INTERVAL_MS = 12 * 60 * 1000;
const REFRESH_RETRY_INTERVAL_MS = 60 * 1000;
const tokenResponseSchema = z.object({
  success: z.literal(true),
  token: z.string().min(1),
  urls: z.object({ clearkey: z.string(), manifest: z.string() }),
});

export interface ProtectedPlaybackSession {
  error: string | null;
  isLoading: boolean;
  licenseUrl: string | null;
  manifestUrl: string | null;
  token: string | null;
}

interface SessionState extends ProtectedPlaybackSession {
  videoId: string;
}

function pendingSession(videoId: string): SessionState {
  return {
    error: null,
    isLoading: true,
    licenseUrl: null,
    manifestUrl: null,
    token: null,
    videoId,
  };
}

function validateResourceUrl(value: string, expectedPath: string): string {
  const url = new URL(value, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    url.pathname !== expectedPath ||
    url.search ||
    url.hash
  ) {
    throw new Error('Unexpected playback resource.');
  }
  return url.pathname;
}

/** Acquire renewable video credentials without fetching or retaining content keys. */
export function useProtectedPlaybackSession(input: {
  enabled: boolean;
  refreshIntervalMs?: number;
  videoId: string;
}): ProtectedPlaybackSession {
  const [state, setState] = useState<SessionState>(() => pendingSession(input.videoId));
  useEffect(() => {
    if (!input.enabled) {
      return;
    }
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const prefix = `/videos/${encodeURIComponent(input.videoId)}`;
    const refreshIntervalMs = input.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;

    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        void hydrate(true);
      }, delay);
    };

    const hydrate = async (isRefresh: boolean) => {
      try {
        const response = await fetch(`${prefix}/token`, {
          credentials: 'include',
          signal: abort.signal,
        });
        abort.signal.throwIfAborted();
        if ([401, 403, 404].includes(response.status)) {
          setState({
            ...pendingSession(input.videoId),
            error: 'This video is no longer available.',
            isLoading: false,
          });
          return;
        }
        if (!response.ok) {
          throw new Error('Could not prepare secure playback.');
        }
        const payload = tokenResponseSchema.parse(await response.json());
        const manifestUrl = validateResourceUrl(payload.urls.manifest, `${prefix}/manifest.mpd`);
        const licenseUrl = validateResourceUrl(payload.urls.clearkey, `${prefix}/clearkey`);
        abort.signal.throwIfAborted();
        setState({
          error: null,
          isLoading: false,
          licenseUrl,
          manifestUrl,
          token: payload.token,
          videoId: input.videoId,
        });
        schedule(refreshIntervalMs);
      } catch {
        if (abort.signal.aborted) {
          return;
        }
        if (isRefresh) {
          schedule(Math.min(refreshIntervalMs, REFRESH_RETRY_INTERVAL_MS));
        } else {
          setState({
            ...pendingSession(input.videoId),
            error: 'Could not prepare secure playback. Please try again.',
            isLoading: false,
          });
        }
      }
    };

    void hydrate(false);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [input.enabled, input.refreshIntervalMs, input.videoId]);
  const current =
    input.enabled && state.videoId === input.videoId ? state : pendingSession(input.videoId);
  return {
    error: current.error,
    isLoading: current.isLoading,
    licenseUrl: current.licenseUrl,
    manifestUrl: current.manifestUrl,
    token: current.token,
  };
}
